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

/**
 * This module is the central clearinghouse for database change updates.
 * Any module may register a handler for notification of data changes.
 *
 * The notification handler has the arguments: (action, tableName, id)
 *   Where action is ADD, EXISTS, DELETE, UPDATE
 *   tableName is the name of the database table that was modified
 *   id is the unique key of the changed row in the database
 *
 * Triggering notifications mirrors the database transaction lifecycle.
 * Start by allocating a NotifyTransaction.  In the body of the transaction,
 * record adds, deletes, and updates of table rows.  After successfully committing
 * the database transaction, commit the NotifyTransaction to cause the notification
 * handlers to be called.
 *
 * const notify = new NotifyTransaction();
 * await client.query('BEGIN');
 * ...
 * notify.[add,delete,update](tableName, rowId);
 * ...
 * await client.query('COMMIT');
 * await notify.commit();
 */

import { Log }            from "@skupperx/modules/log";
import { ClientFromPool } from "./db.js";
import { WatchNotify }    from "./watch-server.js";

const registeredHandlers   = {};  // {tableName => [List of handlers]}
const INITIAL_NOTIFY_DELAY = 3000;

export async function RegisterNotification(tableName, handler, initialNotification) {
    if (!registeredHandlers[tableName]) {
        registeredHandlers[tableName] = [];
    }

    registeredHandlers[tableName].push(handler);

    if (initialNotification) {
        setTimeout(async () => {
            const client = await ClientFromPool('system');
            try {
                const rows = await client.query(`SELECT Id FROM ${tableName}`).then(result => result.rows);
                for (const row of rows) {
                    await handler('EXISTS', tableName, row.id);
                }
            } catch (error) {
                Log(`Exception in initial notification: ${error.message}`);
            } finally {
                client.release();
            }
        }, INITIAL_NOTIFY_DELAY);
    }
}

export class NotifyTransaction {
    constructor() {
        this.events = [];
    }

    add(tableName, id) {
        this.events.push({
            action    : 'ADD',
            tableName : tableName,
            id        : id,
        });
    }

    delete(tableName, id) {
        this.events.push({
            action    : 'DELETE',
            tableName : tableName,
            id        : id,
        });
    }

    update(tableName, id) {
        this.events.push({
            action    : 'UPDATE',
            tableName : tableName,
            id        : id,
        });
    }

    async commit() {
        for (const item of this.events) {
            const handlers = registeredHandlers[item.tableName] || [];
            for (const h of handlers) {
//              Log(`Calling notify handler for table ${item.tableName}, id ${item.id}`);
                await h(item.action, item.tableName, item.id);
                await WatchNotify(item.tableName, item.id);
            }
        }
    }
}
