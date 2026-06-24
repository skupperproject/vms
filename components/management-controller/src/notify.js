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
 * The notification handler has the arguments: (action, id, tableName, data)
 *   Where action is ADD, DELETE, UPDATE, EXISTS, EXISTS_COMPLETE
 *   tableName is the name of the database table that was modified
 *   id is the unique key of the changed row in the database
 *   data is the entire data record (only supplied in EXISTS notifications)
 *
 * Action:
 *   ADD    - A new data row was created
 *   DELETE - A data row was deleted
 *   UPDATE - An existing data row was modified
 *   EXISTS - during initial-notification, indicates that a row exists in the database
 *   EXISTS_COMPLETE - initial-notification is complete.  No further EXISTS events will occur on this handler.
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
let   transactionId        = 1;

export async function RegisterNotification(tableName, handler, initialNotification) {
    if (!registeredHandlers[tableName]) {
        registeredHandlers[tableName] = [];
    }

    registeredHandlers[tableName].push(handler);

    if (initialNotification) {
        setTimeout(async () => {
            const client = await ClientFromPool('system');
            try {
                const rows = await client.query(`SELECT * FROM ${tableName}`).then(result => result.rows);
                for (const row of rows) {
                    await handler('EXISTS', row.id, tableName, row);
                }
                await handler('EXISTS_COMPLETE', null, tableName);
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
        this.id     = transactionId++;
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
                try {
                    //console.log(`(tx: ${this.id}) NOTIFY HANDLER: ${item.action} ${item.tableName}, ${item.id}`);
                    await h(item.action, item.id, item.tableName);
                    //console.log('    notify complete');
                } catch (error) {
                    Log('Exception in notification handler:', item);
                    Log(error.stack);
                }
            }
            await WatchNotify(item.tableName, item.id);
        }
    }
}
