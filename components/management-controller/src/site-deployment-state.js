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
// This module is responsible for maintaining the deployment-state for interior sites.
//

import { Log } from '@skupperx/common/log'
import { ClientFromPool } from './db.js';

const evaluateSingleSite_TX = async function (client, site) {
    let state = 'not-ready';

    if (site.lifecycle == 'active') {
        state = 'deployed';
    } else if (site.lifecycle == 'ready') {
        //
        // Find the links which come from this site and go to access points on sites with deployed state
        //
        const peerResult = await client.query("SELECT InterRouterLinks.Id FROM InterRouterLinks " +
                                              "JOIN BackboneAccessPoints ON AccessPoint = BackboneAccessPoints.Id " +
                                              "JOIN InteriorSites ON BackboneAccessPoints.InteriorSite = InteriorSites.Id " +
                                              "WHERE InterRouterLinks.ConnectingInteriorSite = $1 AND InteriorSites.DeploymentState = 'deployed'", [site.id]);
        if (peerResult.rowCount > 0) {
            state = 'ready-automatic';
        } else {
            //
            // Find manage access points on this site
            //
            const apResult = await client.query("SELECT Id FROM BackboneAccessPoints WHERE Kind = 'manage' AND InteriorSite = $1", [site.id]);
            if (apResult.rowCount > 0) {
                state = 'ready-bootstrap';
            }
        }
    }

    if (state != site.deploymentstate) {
        await client.query("UPDATE InteriorSites SET DeploymentState = $1 WHERE Id = $2", [state, site.id]);
    }
}

export async function SiteLifecycleChanged_TX(client, siteId, newState) {
    const result = await client.query("SELECT Id, Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1", [siteId]);
    if (result.rowCount == 1) {
        const site = result.rows[0];
        await evaluateSingleSite_TX(client, site);
        if (newState == 'active') {
            //
            // If this site became active, evaluate all sites connected to this site
            //
            const connected = await client.query("SELECT ConnectingInteriorSite FROM InterRouterLinks " +
                                                 "JOIN BackboneAccessPoints ON BackboneAccessPoints.Id = AccessPoint " +
                                                 "WHERE BackboneAccessPoints.InteriorSite = $1", [siteId]);
            for (const row of connected.rows) {
                const siteResult = await client.query("SELECT Id, Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1", [row.connectinginteriorsite]);
                if (siteResult.rowCount == 1) {
                    await evaluateSingleSite_TX(client, siteResult.rows[0]);
                }
            }
        }
    }
}

export async function LinkAddedOrDeleted(connectingSiteId, accessPointId) {
    const client = await ClientFromPool();
    try {
        await client.query("BEGIN");
        //
        // If listening site is "deployed", re-evaluate the connecting site
        //
        const lResult = await client.query("SELECT InteriorSites.DeploymentState FROM BackboneAccessPoints " +
                                           "JOIN InteriorSites ON InteriorSites.Id = InteriorSite " +
                                           "WHERE BackboneAccessPoints.Id = $1", [accessPointId]);
        if (lResult.rowCount == 1 && lResult.rows[0].deploymentstate == 'deployed') {
            const cResult = await client.query("SELECT Id, Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1", [connectingSiteId]);
            if (cResult.rowCount == 1) {
                await evaluateSingleSite_TX(client, cResult.rows[0]);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in LinkAddedOrDeleted: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

export async function ManageIngressAdded(siteId) {
    const client = await ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (site.deploymentstate == 'not-ready') {
                await evaluateSingleSite_TX(client, site);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in ManageIngressAdded: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}

export async function ManageIngressDeleted(siteId) {
    const client = await ClientFromPool();
    try {
        await client.query("BEGIN");
        const result = await client.query("SELECT Id, Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1", [siteId]);
        if (result.rowCount == 1) {
            const site = result.rows[0];
            if (site.deploymentstate == 'ready-bootstrap') {
                await evaluateSingleSite_TX(client, site);
            }
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        Log(`Exception in ManageIngressDeleted: ${error.message}`);
        Log(error.stack);
    } finally {
        client.release();
    }
}
