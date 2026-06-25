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

//
// The responsibility of this module is to maintain an AMQP connection to each backbone network.
//

import { LoadSecret } from '@skupperx/modules/kube'
import { Log } from '@skupperx/modules/log'
import { ClientFromPool } from './db.js';
import { OpenConnection, CloseConnection } from '@skupperx/modules/amqp'
import { NotifyTransaction, RegisterNotification } from './notify.js';

let controller_name;
let tls_ca;
let tls_cert;
let tls_key;
let manageConnections = {};
let registrations = [];

async function createConnection(apid, row) {
    manageConnections[apid] = {
        toDelete:  false,
        host:      row.hostname,
        port:      row.port,
        colocated: row.colocated,
    };

    Log(`Connecting to Access Point: ${row.hostname}:${row.port}`);
    manageConnections[apid].conn = OpenConnection(
        `Backbone-management-${apid}`,
        row.hostname,
        row.port,
        'tls',
        tls_ca,
        tls_cert,
        tls_key);

    for (const reg of registrations) {
        await reg.onLinkAdded(apid, manageConnections[apid].conn, { colocated: manageConnections[apid].colocated });
    }
}

async function deleteConnection(apid) {
    const conn      = manageConnections[apid].conn;
    const colocated = manageConnections[apid].colocated;
    CloseConnection(conn);
    delete manageConnections[apid];

    for (const reg of registrations) {
        await reg.onLinkDeleted(apid, { colocated: colocated });
    }
}

async function periodicCheck() {
    const normal_period  = 30000;
    const startup_period = 2000;
    await reconcileBackboneConnections();
    setTimeout(periodicCheck, !!tls_cert ? normal_period : startup_period);
}

async function reconcileBackboneConnections() {
    const client = await ClientFromPool('system');
    try {
        await client.query('BEGIN');
        const result = await client.query(
            "SELECT *, InteriorSites.CoLocated FROM BackboneAccessPoints AS ap " +
            "JOIN InteriorSites ON InteriorSites.Id = ap.InteriorSite " +
            "WHERE ap.Lifecycle = 'ready' AND ap.Kind = 'manage'"
        );

        for (const apid of Object.keys(manageConnections)) {
            manageConnections[apid].toDelete = true;
        }

        for (const row of result.rows) {
            if (manageConnections[row.id]) {
                manageConnections[row.id].toDelete = false;
            } else {
                // Fire and forget individual connection promises to prevent a single
                // failure from blocking subsequent access points.
                createConnection(row.id, row);
            }
        }

        for (const apid of Object.keys(manageConnections)) {
            if (manageConnections[apid].toDelete) {
                await deleteConnection(apid);
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back reconcile-backbone-connections transaction: ${err.stack}`);
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
}

async function resolveTLSData() {
    let reschedule_delay = 1000;
    const client = await ClientFromPool('system');
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Name = $1 and LifeCycle = 'ready'", [controller_name]);
        if (result.rowCount == 1) {
            const tls_result = await client.query("SELECT ObjectName FROM TlsCertificates WHERE Id = $1", [result.rows[0].certificate]);
            if (tls_result.rowCount == 1) {
                const secret = await LoadSecret(tls_result.rows[0].objectname);
                let   count  = 0;
                for (const [key, value] of Object.entries(secret.data)) {
                    if (key == 'ca.crt') {
                        tls_ca = Buffer.from(value, 'base64');
                        count += 1;
                    } else if (key == 'tls.crt') {
                        tls_cert = Buffer.from(value, 'base64');
                        count += 1;
                    } else if (key == 'tls.key') {
                        tls_key = Buffer.from(value, 'base64');
                        count += 1;
                    }
                }

                if (count != 3) {
                    throw new Error(`Unexpected set of values from TLS secret data - expected 3, got ${count}`);
                }

                reschedule_delay = -1;
                setTimeout(reconcileBackboneConnections, 0);
            } else {
                throw new Error(`Expected to find a TlsCertificate record for ready controller: ${result.rows[0].certificate}`);
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        Log(`Rolling back resolveTLSData transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveTLSData, reschedule_delay);
        }
    }
}

async function resolveControllerRecord() {
    let reschedule_delay = -1;
    const client = await ClientFromPool('system');
    const notify = new NotifyTransaction();
    try {
        await client.query('BEGIN');
        const result = await client.query("SELECT * FROM ManagementControllers WHERE Name = $1", [controller_name]);
        if (result.rowCount == 1) {
            setTimeout(resolveTLSData, 0);
        } else {
            const addResult = await client.query("INSERT INTO ManagementControllers (Name) VALUES ($1) RETURNING Id", [controller_name]);
            notify.add('ManagementControllers', addResult.rows[0].id);
            setTimeout(resolveTLSData, 1000);
            Log(`No management controller found for '${controller_name}', created new record`);
        }
        await client.query('COMMIT');
        await notify.commit();
    } catch (err) {
        Log(`Rolling back resolveControllerRecord transaction: ${err.stack}`);
        await client.query('ROLLBACK');
        reschedule_delay = 10000;
    } finally {
        client.release();
        if (reschedule_delay >= 0) {
            setTimeout(resolveControllerRecord, reschedule_delay);
        }
    }
}

async function onAccessPointChange(action, id) {
    if ((action == 'DELETE' || action == 'UPDATE') && id in manageConnections) {
        await reconcileBackboneConnections();
    }
}

export async function RegisterHandler(onAdded, onDeleted) {
    for (const [key, value] of Object.entries(manageConnections)) {
        await onAdded(key, value.conn);
    }

    registrations.push({
        onLinkAdded   : onAdded,
        onLinkDeleted : onDeleted,
    });
}

export async function Start(name) {
    Log(`[Backbone-links module starting for controller: ${name}]`);
    controller_name = name;
    await resolveControllerRecord();
    RegisterNotification('BackboneAccessPoints', onAccessPointChange, false);
    setTimeout(periodicCheck, 5000);
}
