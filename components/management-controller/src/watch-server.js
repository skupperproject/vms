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

class HandlerResponse {
    constructor() {
        this.body = null;
        this.json = null;
        this.status = null;
        this.send = null;
    }

    json(arg) {
        this.json = arg;
    }
    status(arg) {
        this.status = arg;
    }
    send(arg) {
        this.send = arg;
    }
}

export async function StartWatchServer(server, sessionParser, _app, _router) {
    Log('[Watch Server Starting]');
    app    = _app;
    router = _router;
    container = rhea.create_container();

    wss = new WebSocketServer({ noServer: true });

    //
    // Explicitly run the session middleware to ensure the session is present in the websocket connection.
    //
    server.on('upgrade', (req, socket, head) => {
        sessionParser(req, {}, () => {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        });
    });

    wss.on('connection', function (ws, req) {
        container.websocket_accept(ws, {'httpreq': req, 'state': {}});
    });

    container.on('receiver_open', function(context) {
        context.connection.options.state['receiver'] = context.receiver;
    });

    container.on('sender_open', function(context) {
        context.connection.options.state['sender'] = context.sender;
    });

    container.on('receiver_closed', function(context) {
        context.connection.options.state['receiver'] = null;
    });

    container.on('message', function(context) {
        const request = context.message.body;
        const req = context.connection.options.httpreq || {};
        const reply_message = {address: context.message.reply_to, application_properties: {}};
        req.method = request.method;
        req.url = '/' + context.receiver.target.address + '/' + request.uri;
        req.query = {};
        const res = {
            send: (data) => console.log('Response sent:', data),
            json: (data) => {
                reply_message.body = data;
                context.connection.options.state.sender.send(reply_message);
            },
            redirect: (data) => console.log('Redirect: ', data),
            setHeader: (name, value) => {
                reply_message.application_properties[name] = value;
            },
            auth_callback: (data) => console.log('auth_callback', data),
            status: function(code) { this.statusCode = code; return this; }
        };
        router.handle(req, res, (err) => {
            if (err) console.error('Router error:', err);
        });
    });
}
