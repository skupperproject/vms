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

/**
 * Start the colo sync module
 * @returns {Promise<void>}
 */
export async function Start() {
    Log("[Colo-Sync Module Started]")
    // sync k8s state with database state on startup and every 60 seconds thereafter (additionally on backbone creation and deletion)
    await processColoBackbones()
}

/**
 * Process colo backbones and reconcile namespaces
 * @returns {Promise<void>}
 */
export async function processColoBackbones() {
    const client = await ClientFromPool('system')
    try {
        // get all backbones with colo namespaces
        const coloBackbones = await client.query(`SELECT Id, CoLocatedNamespace FROM Backbones WHERE CoLocatedNamespace IS NOT NULL`).then(res => res.rows)
        // sync k8s state with database state
        if (coloBackbones.length > 0) {
            await reconcileNamespaces(coloBackbones)
        }
    } catch (err) {
        Log(`[Colo-Sync] Error in colo backbone processing: ${err.stack || err}`)
    } finally {
        client.release()
        setTimeout(processColoBackbones, 60000)
    }
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
            await deploySite(bb.id, bb.colocatednamespace)
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
 * If the colocated site is ready, create the colo namespace and deploy the site in it
 * @param {string} backboneId - The backbone id
 * @param {string} ns - The namespace to deploy the site in
 * @returns {Promise<void>}
 */
async function deploySite(backboneId, ns) {
    const client = await ClientFromPool('system')
    try {
        const siteId = await client.query(`SELECT Id FROM InteriorSites WHERE Backbone = $1 AND CoLocated = true AND Lifecycle = 'ready'`, [backboneId]).then(res => res.rows[0]?.id)
        if (siteId) {
            Log(`[Colo-Sync] deploying namespace ${ns}`)
            await kube.createNamespace(ns)

            const siteYamlObjects = await fetchSiteYaml(siteId);
        
            Log(`[Colo-Sync] deploying site in namespace ${ns}`)
            for (const obj of siteYamlObjects) {
                await kube.ApplyObject(obj, ns)
            }
        }
    } catch (err) {
        Log(`[Colo-Sync] Error in deploying site in namespace ${ns}: ${err.stack || err}`)
    } finally {
        client.release()
    }
}

/**
 * Fetch the site yaml objects for the colocatedsite
 * @param {string} siteId - The site id
 * @returns {Promise<Array<Object>>} - The site yaml objects
 */
async function fetchSiteYaml(siteId) {
    const client = await ClientFromPool('system')
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
        
        const accessPoints = await sync.GetBackboneAccessPoints_TX(client, siteId, true);
        for (const [apId, apData] of Object.entries(accessPoints)) {
            if (apData.kind == 'manage') {
                output.push(resourceTemplates.AccessPointConfigMap(apId, apData));
            }
        }
        return output;
    } catch (err) {
        throw new Error('Failed to fetch site yaml: ' + err.message);
    } finally {
        client.release()
    }
}
