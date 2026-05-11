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

/**
 * This module is responsible for synchronizing the state of co-located namespaces and sites.
 * The database is the source of truth for the state of the co-located namespaces and sites.
 * The Kubernetes state will be reconciled with the database state if they are out of sync.
 */

import * as kube from "@skupperx/modules/kube"
import { Log } from "@skupperx/modules/log"
import { ClientFromPool } from "./db.js"
import { META_ANNOTATION_SKUPPERX_CONTROLLED } from "@skupperx/modules/common"
import * as resourceTemplates from "./resource-templates.js"
import * as sync from "./sync-management.js"
import * as common from "@skupperx/modules/common"

let client

/**
 * Start the colo sync module
 * @returns {Promise<void>}
 */
export async function Start() {
    Log("[Colo-Sync Module Started]")
    client = await ClientFromPool('system')
    // sync k8s state with database state on startup and every 60 seconds thereafter (additionally on backbone creation and deletion)
    try {
        await processColoBackbones()
    } catch (err) {
        Log(`[Colo-Sync] Error in colo backbone processing: ${err.stack || err}`)
    } 
}

/**
 * Process colo backbones and reconcile namespaces
 * @returns {Promise<void>}
 */
export async function processColoBackbones() {
    // get all backbones with colo namespaces
    const coloBackbones = await client.query(`SELECT Id, CoLocatedNamespace FROM Backbones WHERE NULLIF(CoLocatedNamespace, '') IS NOT NULL`).then(res => res.rows)
    // sync k8s state with database state
    if (coloBackbones.length > 0) {
        await reconcileNamespaces(coloBackbones)
    }
    setTimeout(processColoBackbones, 60000)
}


/**
 * Reconcile Kubernetes namespaces for the colo backbones
 * @param {Array<Object>} coloBackbones - The colo backbones with their colo namespaces
 * @returns {Promise<void>}
 */
async function reconcileNamespaces(coloBackbones) {
    const existingNamespaces = await kube.GetNamespaces().then(namespace => namespace.items.map(ns => ({name: ns.metadata.name, annotations: ns.metadata.annotations})))
    const coloNamespaces = new Set(coloBackbones.map(bb => bb.colocatednamespace))
    // create colocated namespaces if they don't exist on the cluster
    for (const bb of coloBackbones) {
        if (!existingNamespaces.some(existingNs => existingNs.name === bb.colocatednamespace)) {
            await deployColo(bb.id, bb.colocatednamespace)
        }
    }
    
    const vmsManagedNamespaces = existingNamespaces.filter(ns => ns.annotations?.[META_ANNOTATION_SKUPPERX_CONTROLLED] == "true").map(ns => ns.name)
    // delete vms managed colocated namespaces if they are not in the database 
    for (const ns of vmsManagedNamespaces) {
        if (!coloNamespaces.has(ns)) {
            Log(`[Colo-Sync] deleting namespace ${ns}`)
            await kube.deleteNamespace(ns)
        }
    }
}

/**
 * Deploy a colo namespace and site
 * @param {string} ns - The namespace to deploy
 * @returns {Promise<void>}
 */
async function deployColo(backboneId, ns) {
    Log(`[Colo-Sync] deploying namespace ${ns}`)
    await kube.createNamespace(ns)

    Log(`[Colo-Sync] deploying site in namespace ${ns}`)
    await deploySite(backboneId, ns)
}

/**
 * Deploy a site in the colo namespace
 * @param {string} ns - The namespace to deploy the site in
 * @returns {Promise<void>}
 */
async function deploySite(backboneId, ns) {
    const siteId = await client.query(`SELECT Id FROM InteriorSites WHERE Backbone = $1 AND CoLocated = true`, [backboneId]).then(res => res.rows[0]?.id)
    // Poll the db against the InteriorSites table for this siteId, waiting for lifecycle='ready'
    // Poll with timeout (60 seconds max)
    const maxWaitMs = 60000;
    const pollIntervalMs = 1000;
    let waitedMs = 0;
    while (true) {
        const pollResult = await client.query(
            "SELECT Lifecycle, DeploymentState FROM InteriorSites WHERE Id = $1 LIMIT 1",
            [siteId]
        );
        if (pollResult.rowCount === 0) {
            throw new Error(`InteriorSite with id ${siteId} not found`);
        }
        if (pollResult.rows[0].lifecycle === 'ready' && pollResult.rows[0].deploymentstate !== 'not-ready') {
            break;
        }
        if (waitedMs >= maxWaitMs) {
            throw new Error(`Timeout: InteriorSite ${siteId} did not become ready after ${maxWaitMs / 1000} seconds.`);
        }
        // sleep for pollIntervalMs
        await new Promise(res => setTimeout(res, pollIntervalMs));
        waitedMs += pollIntervalMs;
    }
    const siteYamlObjects = await fetchSiteYaml(siteId);

    // deploy site
    for (const obj of siteYamlObjects) {
        await kube.ApplyObject(obj, ns)
    }
}

async function fetchSiteYaml(siteId) {
    try {
        const result = await client.query(
            "SELECT Name, DeploymentState, Certificate, TlsCertificates.ObjectName " +
            "FROM   InteriorSites " +
            "JOIN   TlsCertificates ON Certificate = TlsCertificates.Id " +
            "WHERE  Interiorsites.Id = $1", [siteId]);

        if (result.rowCount != 1) {
            throw new Error('Site secret not found');
        }

        const site = result.rows[0];
        if (site.deploymentstate == 'deployed') {
            throw new Error("Not permitted, site already deployed");
        }
        if (site.deploymentstate == 'not-ready') {
            throw new Error("Not permitted, site not ready for deployment");
        }
        const secret = await kube.LoadSecret(site.objectname);
        let output = [
            resourceTemplates.ServiceAccount(),
            resourceTemplates.BackboneRole(),
            resourceTemplates.RoleBinding(),
            resourceTemplates.Deployment(siteId, true, 'sk2'),
            resourceTemplates.Secret(secret, `skx-site-${siteId}`, common.INJECT_TYPE_SITE, `tls-site-${siteId}`),
            resourceTemplates.BackboneSite(site.name, siteId),
            resourceTemplates.NetworkCR('mbone'),
        ];
        const links = await sync.GetBackboneLinks_TX(client, siteId);
        for (const [linkId, linkData] of Object.entries(links)) {
            output.push(resourceTemplates.LinkCR(linkId, linkData, `skx-site-${siteId}`));
        }
        const accessPoints = await sync.GetBackboneAccessPoints_TX(client, siteId, true);
        for (const [apId, apData] of Object.entries(accessPoints)) {
            output.push(resourceTemplates.AccessPointConfigMap(apId, apData));
        }
        return output;
    } catch (err) {
        throw new Error('Failed to fetch site yaml: ' + err.message);
    }
}
