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
// This module is responsible for keeping the current state for desired accessPoints.
// The accessPoints map is maintained based on RouterAccess and NetworkAccess watchers.
//
// The output of this module:
//   Access Points states are synchronized to the management controller.
//   Ingress bundles for the API
//

import {
    Annotation,
    Controlled,
    startWatchRouterAccesses,
    WatchNetworkAccesses
} from '@skupperx/modules/kube';
import { Log } from '@skupperx/modules/log'
import {
    META_ANNOTATION_STATE_ID,
} from '@skupperx/modules/common'
import { UpdateLocalState } from './sync-site-kube.js';
import { createHash } from 'node:crypto';

const accessPoints = {}; // APID => {kind, name, syncHash, syncData}

const newAccessPoint = function(apId, kind, name, syncData) {
    let value = {
        kind       : kind,
        name       : name,
        apId       : apId,
        syncData   : syncData,
        syncHash   : ingressHash(syncData),
    };
    return value;
}

const freeAccessPoint = async function(apid) {
    const ap = accessPoints[apid];
    if (ap) {
        delete accessPoints[apid];
        await UpdateLocalState(`accessstatus-${apid}`, null, {});
    }
}

export function GetAccessPointKind(stateId) {
    if (stateId in accessPoints) {
        return accessPoints[stateId].kind;
    }
    return null;
}

function getAccessPointKindFromAccess(access) {
    if (Controlled(access)) {
        let kind = access.metadata.name.split('-')[0];
        return kind;
    }
    throw new Error(`${access.kind} is not controlled: ${access.metadata.name}`);
}

const hasEndpoints = function(resource) {
    return (('status' in resource) && ('endpoints' in resource.status) && (resource.status.endpoints.length > 0))
}

const getAccessEndpoint = async function(access) {
    if (!hasEndpoints(access)) {
        return null;
    }
    let filterFn = (endpoint) => { return endpoint.group == "skupper-router"};
    if (access.kind == 'NetworkAccess') {
        filterFn = (endpoint) => { return endpoint.name == "inter-network"};
    }
    for (const endpoint of access.status.endpoints) {
        if (filterFn(endpoint)) {
            return {
                host: endpoint.host,
                port: endpoint.port,
            }
        }
    }
    return null;
}

const handleAccessResource = async function(oper, access) {
    if (!Controlled(access)) {
        return;
    }
    const apId = Annotation(access, META_ANNOTATION_STATE_ID);
    const apKind = getAccessPointKindFromAccess(access);
    const kind = access.kind;
    const name = access.metadata.name;
    if (oper == 'DELETED') {
        Log(`${kind} has been deleted - AccessPoint ID: ${apId}, Name: ${name}, Kind: ${apKind}`);
        freeAccessPoint(apId);
        return;
    }
    if (!hasEndpoints(access)) {
        return;
    }
    const syncData = await getAccessEndpoint(access);
    let ap = newAccessPoint(apId, apKind, name, syncData);
    const existing = accessPoints[apId];
    if (existing && existing.syncHash == ap.syncHash) {
        return;
    }
    Log(`${kind} has been updated - AccessPoint ID: ${apId}, Name: ${name}, Kind: ${apKind}`);
    accessPoints[apId] = ap;
    await UpdateLocalState(`accessstatus-${apId}`, ap.syncHash, ap.syncData);
}

export function GetRouterAccessRole(kind) {
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
    return GetIngressBundle();
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

export async function Start() {
    Log('[Ingress Skupper v2 module started]');
    startWatchRouterAccesses(handleAccessResource);
    WatchNetworkAccesses(handleAccessResource);
}
