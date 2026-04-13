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
// This module is responsible for setting up the requested ingresses into a Skupper v2 site.
//
// The input to this module is a set of ConfigMaps that represent configured access points:
//   metadata.annotations:
//     skx/state-type: accesspoint
//     skx/state-id:   <The database ID of the source BackboneAccessPoint>
//   data:
//     kind: [claim|peer|member|manage|van]
//
// The output of this module:
//   Skupper v2 RouterAccess and NetworkAccess resources
//   Ingress bundles for the API
//

import {
    GetRouterAccesses,
    GetNetworkAccesses,
    DeleteRouterAccess,
    DeleteNetworkAccess,
    DeleteSecret,
    Annotation,
    Controlled,
    ApplyObject,
    GetConfigmaps,
    WatchConfigMaps,
    startWatchRouterAccesses,
    WatchNetworkAccesses
} from '@skupperx/modules/kube';
import { Log } from '@skupperx/modules/log'
import {
    META_ANNOTATION_SKUPPERX_CONTROLLED,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_STATE_TYPE,
    STATE_TYPE_ACCESS_POINT
} from '@skupperx/modules/common'
import { UpdateLocalState } from './sync-site-kube.js';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

let reconcile_config_map_scheduled = false;
let reconcile_accesses_scheduled = false;
const accessPoints = {}; // APID => {kind, name, syncHash, syncData, toDelete}
const META_ANNOTATION_ACCESSPOINT_KIND = "skx-accesspoint-kind";
const new_access_point = function(apid, kind, name) {
    let value = {
        kind       : kind,
        name       : name,
        syncHash   : null,
        syncData   : {},
        toDelete   : false,
    };

    if (accessPoints[apid]) {
        throw Error(`accessPoint already exists for ${apid}`);
    }
    accessPoints[apid] = value;
}

const free_access_point = async function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        delete accessPoints[apid];
        await UpdateLocalState(`accessstatus-${apid}`, null, {});
    }
}

const backbone_ingress = function(apid) {
    const access = accessPoints[apid];
    switch (access.kind) {
        case 'manage':
            return backbone_routeraccess(apid);
        case 'van':
            return backbone_networkaccess(apid);
        case 'claim':
            return backbone_routeraccess(apid);
        case 'peer':
            return backbone_routeraccess(apid);
        case 'member':
            return backbone_routeraccess(apid);
        default:
            throw new Error(`Unknown access kind: ${access.kind}`);
    }
}

const short_access_name = function(name) {
    return name.split('-', 2).join('-');
}

const backbone_routeraccess = function(apid) {
    const access = accessPoints[apid];
    const name   = short_access_name(`${access.kind}-${apid}`);
    let routerAccess = {
        apiVersion : 'skupper.io/v2alpha1',
        kind       : 'RouterAccess',
        metadata : {
            name : name,
            annotations : {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [META_ANNOTATION_STATE_ID]            : apid,
                [META_ANNOTATION_ACCESSPOINT_KIND]    : access.kind,
            },
        },
        spec: {
            tlsCredentials: access.name,
            generateTlsCredentials: false,
            roles : [{
                name: getRouterAccessRole(access.kind)
            }],
        },
    };
    return routerAccess;
}

const backbone_networkaccess = function(apid) {
    const access = accessPoints[apid];
    const name   = short_access_name(`${access.kind}-${apid}`);
    let networkAccess = {
        apiVersion : 'skupper.io/v2alpha1',
        kind       : 'NetworkAccess',
        metadata : {
            name : name,
            annotations : {
                [META_ANNOTATION_SKUPPERX_CONTROLLED] : 'true',
                [META_ANNOTATION_STATE_ID]            : apid,
                [META_ANNOTATION_ACCESSPOINT_KIND]    : access.kind,
            },
        },
        spec: {
            tlsCredentials: access.name,
            generateTlsCredentials: false,
        },
    };
    return networkAccess;
}

function getRouterAccessRole(kind) {
    switch (kind) {
        case "manage":
            return "normal";
        case "claim":
            return "normal";
        case "peer":
            return "inter-router";
        case "member":
            return "edge";
        default:
            throw new Error(`Unknown kind: ${kind}`);
    }
}

const do_reconcile_accesses = async function() {
}

const hasEndpoints = function(resource) {
    return (('status' in resource) && ('endpoints' in resource.status) && (resource.status.endpoints.length > 0))
}

const reconcile_accesses = async function() {
    let endpoints = {
        "van": {},
        "manage": {},
        "peer": {},
        "member": {},
        "claim": {},
    };

    const retrieveAccess = async function(fn, filterFn) {
        // Retrieving Access Resource
        for (const access of await fn()) {
            const apid = Annotation(access, META_ANNOTATION_STATE_ID);
            if (!Controlled(access)) {
                continue;
            }
            const endpointKind = Annotation(access, META_ANNOTATION_ACCESSPOINT_KIND);
            if (!hasEndpoints(access)) {
                endpoints[endpointKind][apid] = {
                    delete: false,
                }
                continue;
            }
            for (const endpoint of access.status.endpoints) {
                if (filterFn(endpoint)) {
                    endpoints[endpointKind][apid] = {
                        host: endpoint.host,
                        port: endpoint.port,
                        group: endpoint.group,
                        kind: access.kind,
                        name: access.metadata.name,
                        delete: true,
                    };
                }
            }
        }
    }
    // Retrieving NetworkAccesses ("van" accesspoints)
    await retrieveAccess(GetNetworkAccesses, (endpoint) => { return endpoint.name == "inter-network"});
    await retrieveAccess(GetRouterAccesses, (endpoint) => { return endpoint.group == "skupper-router"});

    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.kind in endpoints && apid in endpoints[ap.kind]) {
            const endpoint = endpoints[ap.kind][apid];
            if (endpoint.delete === false) {
                continue;
            }
            let hash = null;
            let data = {};
            data = {
                host : endpoint.host,
                port : endpoint.port,
            };
            hash = ingressHash(data);
            if (hash != ap.syncHash) {
                accessPoints[apid].syncHash = hash;
                accessPoints[apid].syncData = data;
                await UpdateLocalState(`accessstatus-${apid}`, hash, data);
            }
            endpoint.delete = false;
        } else {
            await ApplyObject(backbone_ingress(apid));
        }
    }

    //
    // Any remaining endpoints (NetworkAccess or RouterAccess) with delete = true were not found in the accessPoints. Delete them.
    //
    for (const kind in endpoints) {
        for (const apid in endpoints[kind]) {
            const endpoint = endpoints[kind][apid];
            if (endpoint.delete === true) {
                console.log(`Deleting access resource: ${endpoint.kind}/${endpoint.name}`);
                switch(endpoint.kind) {
                    case 'NetworkAccess':
                        await DeleteNetworkAccess(endpoint.name);
                        break;
                    case 'RouterAccess':
                        await DeleteRouterAccess(endpoint.name);
                        break;
                }
                DeleteSecret(`skx-access-${apid}`);
            }
        }
    }
}

const reconcile_access_resources = async function() {
    if (!reconcile_accesses_scheduled) {
        reconcile_accesses_scheduled = true;
        try {
            await reconcile_accesses();
        } catch (err) {
            console.log("Error reconciling accesses:", err);
        }
        reconcile_accesses_scheduled = false;
    }
}

const ingressHash = function(data) {
    if (data == {}) {
        return null;
    }

    let text = 'host' + data.host + 'port' + data.port;
    return createHash('sha1').update(text).digest('hex');
}

export function GetIngressBundle() {
    let bundle = {};

    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.syncHash) {
            bundle[apid] = {
                host : ap.syncData.host,
                port : ap.syncData.port,
            };
        }
    }

    return bundle;
}

export async function GetInitialState() {
    await do_reconcile_config_maps();
    await reconcile_access_resources();
    return GetIngressBundle();
}

const do_reconcile_config_maps = async function() {
    reconcile_config_map_scheduled = false;
    const all_config_maps = await GetConfigmaps();
    let ingress_config_maps = {};
    let need_service_sync   = false;

    //
    // Build a map of all configured access points from the config maps.
    //
    for (const cm of all_config_maps) {
        if (Controlled(cm) && Annotation(cm, META_ANNOTATION_STATE_TYPE) == STATE_TYPE_ACCESS_POINT) {
            const apid = Annotation(cm, META_ANNOTATION_STATE_ID);
            if (apid) {
                ingress_config_maps[apid] = cm;
            }
        }
    }

    //
    // Mark all local access points as candidates for deletion.
    //
    for (const apid of Object.keys(accessPoints)) {
        accessPoints[apid].toDelete = true;
    }

    //
    // Un-condemn still-existing ingresses and create new ones.
    //
    for (const [apid, cm] of Object.entries(ingress_config_maps)) {
        if (Object.keys(accessPoints).indexOf(apid) >= 0) {
            accessPoints[apid].toDelete = false;
        } else {
            const kind = cm.data.kind;
            new_access_point(apid, kind, cm.metadata.name);
            need_service_sync = true;
        }
    }

    //
    // Delete access points that are no longer mentioned in the config maps.
    //
    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.toDelete) {
            await free_access_point(apid);
            need_service_sync = true;
        }
    }

    //
    // If the list of ingresses has been altered in any way, re-sync the ingress service.
    //
    if (need_service_sync) {
        await reconcile_access_resources();
    }
}

const reconcile_config_maps = async function() {
    if (!reconcile_config_map_scheduled) {
        reconcile_config_map_scheduled = true;
        await setTimeout(200);
        await do_reconcile_config_maps();
    }
}

const onConfigMapWatch = function(type, apiObj) {
    try {
        const controlled = Controlled(apiObj);
        const state_type = Annotation(apiObj, META_ANNOTATION_STATE_TYPE);
        if (controlled && state_type == STATE_TYPE_ACCESS_POINT) {
            reconcile_config_maps();
        }
    } catch (e) {
        Log('Exception caught in ingress.onConfigMapWatch');
        Log(e.stack);
    }
}

const onRouterAccessWatch = async function(type, route) {
    if (Controlled(route)) {
        await reconcile_access_resources();
    }
}

const onNetworkAccessWatch = async function(type, network) {
    if (Controlled(network)) {
        await reconcile_access_resources();
    }
}

export function GetIngressBundleV2() {
    let bundle = {};
    for (const [apid, ap] of Object.entries(accessPoints)) {
        if (ap.syncHash) {
            bundle[apid] = {
                host : ap.syncData.host,
                port : ap.syncData.port,
            };
        }
    }

    return bundle;
}

export async function Start(siteId) {
    Log('[Ingress Skupper v2 module started]');
    await do_reconcile_config_maps();
    await reconcile_access_resources();
    WatchConfigMaps(onConfigMapWatch);
    startWatchRouterAccesses(onRouterAccessWatch);
    WatchNetworkAccesses(onNetworkAccessWatch);
}
