/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

"use strict";

import { WebSocketServer } from 'ws';
import rhea                from 'rhea';
import { Log }             from '@skupperx/modules/log';

let app;
let router;
let wss;
let container;
let openWatches = [];
const watchIndex = {};  // { table: {<all,id*>: [watches]}}

class Mutex {
    constructor() {
        this._lock = Promise.resolve();
    }

    async acquire() {
        let release;
        const nextLock = new Promise(resolve => { release = resolve; });
        const currentLock = this._lock;
        this._lock = nextLock;
        await currentLock;
        return release;
    }
}

class RouterResponse {
    constructor(watch, isInitial, release) {
        this.isInitial  = isInitial;
        this.watch      = watch;
        this.release    = release;
        this._released  = false;
        this._watch     = null;  // Set by the route handlers
        this.statusCode = null;
        this.message = {application_properties: {}, body: {method: isInitial ? 'GET' : 'UPDATE'}};
    }

    releaseMutex() {
        if (this._released) {
            return;
        }
        this._released = true;
        this.release();
    }

    send(data) {
        if (this.watch.is_closed?.()) {
            this.releaseMutex();
            return;
        }
        try {
            this.message.body.content = data;
            this.watch.send(this.message);
            if (this.isInitial && this._watch) {
                for (const watchMap of this._watch) {
                    if (!watchIndex[watchMap.table]) {
                        watchIndex[watchMap.table] = {all: []};
                    }
                    if (watchMap.id) {
                        if (!watchIndex[watchMap.table][watchMap.id]) {
                            watchIndex[watchMap.table][watchMap.id] = [];
                        }
                        watchIndex[watchMap.table][watchMap.id].push(this.watch);
                    } else {
                        watchIndex[watchMap.table].all.push(this.watch);
                    }
                }
            }
        } catch (e) {
            console.error('watch sender send failed:', e && e.message ? e.message : e);
        }
        this.releaseMutex();
    }

    json(data) {
        this.send(data);
    }

    redirect(data) {
        try {
            if (this.isInitial && !(this.watch.is_closed?.())) {
                this.message.body.statusCode = 401;
                this.message.body.content = 'Would Redirect';
                this.watch.send(this.message);
            }
        } catch (e) {
            console.error('watch redirect send failed:', e?.message ? e.message : e);
        }
        this.releaseMutex();
    }

    setHeader(name, value) {
        this.message.application_properties[name] = value;
    }

    auth_callback(data) {
        console.log('auth_callback', data);
    }

    status(code) {
        this.message.body.statusCode = code;
        this.statusCode = code;
        return this;
    }

    end() {}
};

function pruneIndex() {
    for (const [table, tableMap] of Object.entries(watchIndex)) {
        for (const [key, watchList] of Object.entries(tableMap)) {
            const newList = [];
            for (const watch of watchList) {
                if (openWatches.includes(watch)) {
                    newList.push(watch);
                }
            }
            watchIndex[table][key] = newList;
        }
    }
}

/** One GET at a time per upgraded HTTP connection — senders on the same WS share `req`. */
const mutexByConnection = new WeakMap();

function mutexForWatch(watch) {
    const conn = watch.connection;
    let m = mutexByConnection.get(conn);
    if (!m) {
        m = new Mutex();
        mutexByConnection.set(conn, m);
    }
    return m;
}

async function sendUpdate(watch, isInitial) {
    if (!watch || (watch.is_closed?.())) {
        return;
    }
    const mutex = mutexForWatch(watch);
    const release = await mutex.acquire();
    const url = watch.source.address;

    try {
        const res = new RouterResponse(watch, isInitial, release);
        const req = watch.connection.options.httpreq;

        req.url = url;
        req.method = 'GET';
        req.query = {};
        req._skip_log = !isInitial;

        router.handle(req, res, (err) => {
            if (err) {
                console.error('Router error:', err);
                res.releaseMutex?.();
            }
        });
    } catch (error) {
        release();
    }
}

export async function StartWatchServer(server, sessionParser, _app, _router) {
    Log('[Watch Server Starting]');
    app    = _app;
    router = _router;
    container = rhea.create_container({container_id:'WATCH_SERVER'});

    wss = new WebSocketServer({ noServer: true });

    //
    // Explicitly run the session middleware to ensure the session is present in the websocket connection.
    //
    server.on('upgrade', (req, socket, head) => {
        if (req.url === '/api/v1alpha1/watch') {
            sessionParser(req, {}, () => {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    wss.emit('connection', ws, req);
                });
            });
        }
    });

    wss.on('connection', function (ws, req) {
        container.websocket_accept(ws, {'httpreq': req});
    });

    container.on('sender_open', async function(context) {
        openWatches.push(context.sender);
    });

    container.on('sendable', async function(context) {
        if (!context.sender._initial_sent) {
            context.sender._initial_sent = true;
            sendUpdate(context.sender, true);
        }
    });

    container.on('sender_close', function(context) {
        const newList = openWatches.filter(watch => watch !== context.sender);
        openWatches = newList;
        pruneIndex();
    });

    container.on('connection_close', function(context) {
        //
        // Remove all watches that involve this connection.
        //
        const newList = openWatches.filter(watch => watch.connection !== context.connection);
        openWatches = newList;
        pruneIndex();
    });

    container.on('disconnected', function(context) {
        //
        // Remove all watches that involve this connection.
        //
        const newList = openWatches.filter(watch => watch.connection !== context.connection);
        openWatches = newList;
        pruneIndex();
    });

    container.on('error', function(context) {
        console.log('RHEA Error', context);
    });
}

export async function WatchNotify(tableName, id, holdoff) {
    const tableIndex = watchIndex[tableName];
    let watches = [];
    if (tableIndex) {
        if (id) {
            watches = tableIndex[id] || [];
        }

        for (const watch of watches) {
            if (!(watch.is_closed?.())) {
                sendUpdate(watch, false);
            }
        }

        for (const watch of tableIndex.all) {
            if (!(watch.is_closed?.())) {
                sendUpdate(watch, false);
            }
        }
    }
}
