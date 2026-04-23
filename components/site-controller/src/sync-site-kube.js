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
// This module is the state-sync endpoint for backbone and member sites.
//
// The responsibility of this module is to synchronize Kubernetes state with the management controller.
//
// Local State (synchronized to the management-controller):
//   - Ingress host/port pairs for each access point (programatically supplied by ingress module)
//
// Remote State (synchronized from the management-controller):
//   - Secrets
//   - Access-Point ConfigMaps
//   - Link ConfigMaps
//

import { Log } from '@skupperx/modules/log'
import {
    INJECT_TYPE_SITE,
    INJECT_TYPE_ACCESS_POINT,
    STATE_TYPE_ACCESS_POINT,
    STATE_TYPE_LINK,
    META_ANNOTATION_STATE_KEY,
    META_ANNOTATION_STATE_DIR,
    META_ANNOTATION_STATE_HASH,
    META_ANNOTATION_STATE_TYPE,
    META_ANNOTATION_STATE_ID,
    META_ANNOTATION_TLS_INJECT,
    API_CONTROLLER_ADDRESS
} from '@skupperx/modules/common'
import {
    Annotation,
    GetSecrets,
    GetConfigmaps,
    GetDeployments,
    GetPods,
    ApplyObject,
    DeleteSecret,
    DeleteConfigmap,
    DeleteDeployment,
    LoadSecret,
    LoadConfigmap,
    UpdateLink,
    GetLink,
    DeleteLink,
    Controlled
} from '@skupperx/modules/kube'
import {
    UpdateLocalState as StateSyncUpdateLocalState,
    Start as StateSyncStart,
    CLASS_BACKBONE,
    CLASS_MEMBER,
    AddTarget,
    AddConnection
} from '@skupperx/modules/state-sync'
import { GetInitialState } from './ingress.js';
import { GetInitialState as GetInitialStateV2 } from './ingress-v2.js';
import { HashOfData } from './hash.js';

var backbone_mode;
var backboneClientSecret;
var platform;
var connectedToPeer = false;
var peerId;
var localState = {};  // state-key: {hash, data}

const kubeObjectForState = function(stateKey) {
    const elements   = stateKey.split('-');
    var   objName    = 'skx-' + stateKey;
    var   objDir     = 'remote';
    var   apiVersion = 'v1';
    var   objKind;
    var   objType;
    var   stateType;
    var   stateId;
    var   inject;

    if (elements.length < 2) {
        throw(Error(`Malformed stateKey: ${stateKey}`));
    }

    switch (elements[0]) {
        case 'tls':
            objKind = 'Secret';
            objType = 'kubernetes.io/tls';
            if (elements[1] == 'site') {
                stateId = stateKey.substring(9); // text following 'tls-site-'
                objName = `skx-site-${stateId}`;
                inject  = INJECT_TYPE_SITE;
            } else if (elements[1] == 'server') {
                stateId = stateKey.substring(11); // text following 'tls-server-'
                objName = `skx-access-${stateId}`;
                inject  = INJECT_TYPE_ACCESS_POINT;
            } else {
                throw(Error(`Invalid stateKey prefix ${elements[0]}-${elements[1]}`));
            }
            break;
        case 'access':
            objKind = 'ConfigMap';
            stateType = STATE_TYPE_ACCESS_POINT;
            stateId = stateKey.substring(7); // text following 'access-'
            break;
        case 'link':
            if (platform == 'sk2') {
                apiVersion = 'skupper.io/v2alpha1'
                objKind = 'Link';
            } else {
                objKind = 'ConfigMap';
            }
            stateType = STATE_TYPE_LINK;
            stateId = stateKey.substring(5); // text following 'link-'
            break;
        case 'accessstatus':
            objKind = 'InMemory';
            objDir = 'local';
            break;
        case 'component':
            objKind = 'Spec';
            stateId = stateKey.substring(10); // text following 'component-'
            break;
        case 'iface':
            objKind = 'ConfigMap';
            const role = elements[1];
            break;
        default:
            throw(Error(`Invalid stateKey prefix: ${elements[0]}`))
    }

    return [objName, apiVersion, objKind, objType, objDir, stateType, stateId, inject];
}

const stateForList = function(objectList, local, remote) {
    for (const obj of objectList) {
        const stateKey  = Annotation(obj, META_ANNOTATION_STATE_KEY);
        const stateDir  = Annotation(obj, META_ANNOTATION_STATE_DIR);
        const stateHash = Annotation(obj, META_ANNOTATION_STATE_HASH);

        if (!!stateKey && !!stateDir && !!stateHash) {
            if (stateDir == 'local') {
                local[stateKey] = stateHash;
            } else if (stateDir == 'remote') {
                remote[stateKey] = stateHash;
            }
        }
    }
    return [local, remote];
}

const stateInMemory = function(local) {
    for (const [key, data] of Object.entries(localState)) {
        local[key] = data.hash;
    }
    return local;
}

const getInitialHashState = async function() {
    var local  = {};
    var remote = {};
    const secrets     = await GetSecrets();
    const configmaps  = await GetConfigmaps();
    const deployments = await GetDeployments();
    const pods        = await GetPods();
    [local, remote] = stateForList(secrets, local, remote);
    [local, remote] = stateForList(configmaps, local, remote);
    [local, remote] = stateForList(deployments, local, remote);
    [local, remote] = stateForList(pods, local, remote);
    if (backbone_mode) {
        var _getInitialState = GetInitialState;
        if (platform == 'sk2') {
            _getInitialState = GetInitialStateV2;
        }
        const ingressState = await _getInitialState();
        for (const [apid, state] of Object.entries(ingressState)) {
            local[`accessstatus-${apid}`] = {
                hash : HashOfData(state),
                data : state,
            };
        }
    }
    local = stateInMemory(local);
    return [local, remote];
}

const doStateChangeSpec = async function(obj, data) {
    if (obj.apiVersion == 'skupper.io/v2alpha1') {
        switch (obj.kind) {
            case "Link":
                await syncLinkSpec(obj, data);
        }
    }
}

const onNewPeer = async function(_peerId, peerClass) {
    connectedToPeer = true;
    peerId = _peerId;
    return await getInitialHashState();
}

const onPeerLost = async function(peerId) {
    connectedToPeer = false;
    peerId = undefined;
}

const retrieveLatest = async function(apiVersion, objKind, objName) {
    Log(`Retrieving latest object - kind: ${apiVersion}.${objKind}, name: ${objName}`);
    if (apiVersion == "skupper.io/v2alpha1") {
        try {
            switch (objKind) {
                case "Link":
                    return await GetLink(objName);
            }
        } catch (ex) {
            if ('code' in ex && ex.code != 404) {
                Log(`Error retrieving object - kind: ${apiVersion}.${objKind}, name: ${objName}, error: ${ex}`);
            }
        }
    }
    return undefined;
}

const updateObject = async function(obj) {
    let apiVersion = obj.apiVersion;
    let objKind = obj.kind;
    let objName = obj.metadata.name;
    Log(`Updating object - kind: ${apiVersion}.${objKind}, name: ${objName}`)
    if (apiVersion == "skupper.io/v2alpha1") {
        switch (objKind) {
            case "Link":
                return await UpdateLink(obj);
            default:
                Log(`Unsupported object kind: ${apiVersion}.${objKind}, name: ${objName}`)
        }
    }
    return undefined;
}

async function syncLinkSpec(obj, data) {
    obj.spec = {
        tlsCredentials: await getBackboneClientSecret(),
        cost: parseInt(data.cost, 10),
        endpoints: [{
            name: 'inter-router',
            group: 'skupper-router',
            host: data.host,
            port: data.port,
        }],
    };
}

async function getBackboneClientSecret() {
    if (!!backboneClientSecret) {
        return backboneClientSecret;
    }
    for (let secret of await GetSecrets()) {
        if (!Controlled(secret) || Annotation(secret, META_ANNOTATION_TLS_INJECT) != INJECT_TYPE_SITE) {
            continue;
        }
        backboneClientSecret = secret.metadata.name;
        return backboneClientSecret;
    }
    if (!backboneClientSecret) {
        throw new Error('Site client certificate not found');
    }
}

const onStateChange = async function(peerId, stateKey, hash, data) {
    const [objName, apiVersion, objKind, objType, objDir, stateType, stateId, inject] = kubeObjectForState(stateKey);
    if (objDir == 'local') {
        throw(Error(`Protocol error: Received update for local state ${stateKey}`));
    }

    if (objName == 'spec') {
        await doStateChangeSpec(hash, data);
    } else {
        if (!!hash) {
            let isSkupperResource = apiVersion == 'skupper.io/v2alpha1';
            let obj = await retrieveLatest(apiVersion, objKind, objName);
            let create = true;
            if (!obj) {
                obj = {
                    apiVersion : apiVersion,
                    kind       : objKind,
                    metadata   : {
                        name        : objName,
                        annotations : {
                            [META_ANNOTATION_STATE_KEY]  : stateKey,
                            [META_ANNOTATION_STATE_DIR]  : objDir,
                            [META_ANNOTATION_STATE_HASH] : hash,
                        },
                    },
                };
            } else {
                let existing_hash = obj.metadata.annotations[META_ANNOTATION_STATE_HASH];
                if (existing_hash == hash) {
                    Log(`Ignoring state change for kind: ${apiVersion}/${objKind}, name: ${objName} as hash is unchanged: ${hash}`);
                    return;
                }
                create = false;
                obj.metadata.annotations[META_ANNOTATION_STATE_KEY] = stateKey;
                obj.metadata.annotations[META_ANNOTATION_STATE_DIR] = objDir;
                obj.metadata.annotations[META_ANNOTATION_STATE_HASH] = hash;
            }
            if (!isSkupperResource) {
                obj.data = data
            } else {
                await doStateChangeSpec(obj, data)
            }

            if (objType) {
                obj.type = objType;
            }

            if (stateType) {
                obj.metadata.annotations[META_ANNOTATION_STATE_TYPE] = stateType;
            }

            if (stateId) {
                obj.metadata.annotations[META_ANNOTATION_STATE_ID] = stateId;
            }

            if (inject) {
                obj.metadata.annotations[META_ANNOTATION_TLS_INJECT] = inject;
            }

            if (create) {
                await ApplyObject(obj);
            } else {
                await updateObject(obj);
            }
        } else {
            if (objKind == 'Secret') {
                await DeleteSecret(objName);
            } else if (objKind == 'ConfigMap') {
                await DeleteConfigmap(objName);
            } else if (objKind == 'Deployment') {
                await DeleteDeployment(objName);
            } else if (objKind == "Link") {
                await DeleteLink(objName);
            }
        }
    }
}

const onStateRequest = async function(peerId, stateKey) {
    const [objName, apiVersion, objKind, objType, objDir] = kubeObjectForState(stateKey);
    if (objDir == 'remote') {
        throw(Error(`Protocol error: Received request for remote state ${stateKey}`));
    }

    var obj;
    var hash;

    try {
        if (objKind == 'Secret') {             // No local secrets currently
            obj  = await LoadSecret(objName);
            hash = Annotation(obj, META_ANNOTATION_STATE_HASH);
        } else if (objKind == 'ConfigMap') {   // No local configmaps currently
            obj  = await LoadConfigmap(objName);
            hash = Annotation(obj, META_ANNOTATION_STATE_HASH);
        } else if (objKind == 'InMemory') {
            obj  = { data : localState[stateKey].data };
            hash = localState[stateKey].hash;
        }
    } catch (error) {
        hash = null;
    }

    if (!!hash) {
        return [hash, obj.data];
    }
    return [null, null];
}

const onPing = async function(siteId) {
    // This function intentionally left blank
}

export async function UpdateLocalState(stateKey, stateHash, stateData) {
    if (stateHash) {
        localState[stateKey] = {
            hash : stateHash,
            data : stateData,
        };
    } else {
        delete localState[stateKey];
    }

    if (connectedToPeer) {
        await StateSyncUpdateLocalState(peerId, stateKey, stateHash);
    }
}

export async function Start(siteId, conn, _backbone_mode, _platform) {
    backbone_mode = _backbone_mode;
    platform = _platform;
    Log(`[Sync-Site-Kube module started]`);
    await StateSyncStart(backbone_mode ? CLASS_BACKBONE : CLASS_MEMBER, siteId, undefined, onNewPeer, onPeerLost, onStateChange, onStateRequest, onPing);
    await AddTarget(API_CONTROLLER_ADDRESS);
    await AddConnection(undefined, conn);
}
