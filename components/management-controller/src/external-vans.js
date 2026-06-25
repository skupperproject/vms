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
// This module handles communication with managed externally-created VANs.
//
// - Register to get access to the AMQP connection to the management backbone
// - Reconcile the router's address table (network-style addresses) with the connected status of networks in the database
//

import { Log } from '@skupperx/modules/log'
import { RouterManagement } from '@skupperx/modules/router'
import { RegisterHandler } from "./backbone-links.js";
import { ClientFromPool } from './db.js';
import { NotifyTransaction } from './notify.js';

const backbone_routers = {};  // backbone_id => RouterManagement

async function getNetworkIds() {
    let network_ids = [];
    try {
        for (const [bbid, router] of Object.entries(backbone_routers)) {
            const addresses = await router.listAddresses(['key']);
            for (const addr of addresses) {
                const kind = addr.key[0];
                const text = addr.key.slice(1);
                if (kind == 'N') {
                    network_ids.push(text);
                }
            }
        }
    } catch (error) {
        Log(`Exception caught in getNetworkIds: ${error.stack}`);
    }
    return network_ids;
}

async function reconcileConnectedNetworks() {
    let reschedule_delay = 5000;
    const client = await ClientFromPool('system');
    const notify = new NotifyTransaction();
    try {
        await client.query("BEGIN");
        let   pending_change = {};
        const network_ids = await getNetworkIds();
        const db_result = await client.query(
            "SELECT id, name, vanid, connected FROM ApplicationNetworks"
        );
        for (const net of db_result.rows) {
            if (network_ids.includes(net.vanid)) {
                // The network is attached
                if (!net.connected) {
                    pending_change[net.id] = true;
                    Log(`External VAN '${net.name}' is now connected`);
                }
            } else {
                // The network is not attached
                if (net.connected) {
                    pending_change[net.id] = false;
                    Log(`External VAN '${net.name}' connection lost`);
                }
            }
        }

        for (const [vid, connected] of Object.entries(pending_change)) {
            await client.query("UPDATE ApplicationNetworks SET Connected = $2 WHERE Id = $1", [vid, connected]);
            notify.update('ApplicationNetworks', vid);
        }

        await client.query("COMMIT");
        await notify.commit();
    } catch (err) {
        await client.query("ROLLBACK");
        reschedule_delay = 10000;
    } finally {
        client.release();
        setTimeout(reconcileConnectedNetworks, reschedule_delay);
    }
}

async function linkAdded(bbid, conn, args) {
    if (args.colocated) {
        backbone_routers[bbid] = new RouterManagement(conn);
        await backbone_routers[bbid].start();
    }
}

async function linkDeleted(bbid, args) {
    if (args.colocated) {
        delete backbone_routers[bbid];
    }
}

export async function Start() {
    Log(`[External-VANs module starting]`);
    RegisterHandler(linkAdded, linkDeleted);
    await reconcileConnectedNetworks();
}
