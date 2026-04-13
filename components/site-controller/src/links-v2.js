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

/*
 * This module is responsible for synchronizing:
 *   - ConfigMaps with skx/state-type == link
 * 
 * Rendering Skupper V2 Link resources between backbone sites
 */

import { Log } from '@skupperx/modules/log'
import {
    Annotation,
    ApplyObject,
    Controlled,
    GetSecrets,
    WatchConfigMaps,
    UpdateLink,
    GetLink,
    GetLinks,
    DeleteLink,
    GetConfigmaps
} from '@skupperx/modules/kube'
import {
    META_ANNOTATION_TLS_INJECT,
    INJECT_TYPE_SITE,
    META_ANNOTATION_STATE_TYPE,
    META_ANNOTATION_STATE_ID,
    STATE_TYPE_LINK,
    META_ANNOTATION_STATE_DIR,
    META_ANNOTATION_STATE_HASH,
    META_ANNOTATION_STATE_KEY
} from '@skupperx/modules/common'

let backboneClientSecret; // name : string
let backboneLinkConfigMaps = {}; // { <name : string> : <cm : obj> }
let outgoingLinks = {}; // { <name : string> : <link : obj> }

async function loadBackboneClientSecret() {
    for (let secret of await GetSecrets()) {
        if (!Controlled(secret) || Annotation(secret, META_ANNOTATION_TLS_INJECT) != INJECT_TYPE_SITE) {
            continue
        }
        backboneClientSecret = secret.metadata.name
    }
    if (!backboneClientSecret) {
        throw new Error('Site client certificate not found')
    }
}

async function loadExistingOutgoingLinks() {
    for (let link of await GetLinks()) {
        if (Controlled(link) && Annotation(link, META_ANNOTATION_STATE_TYPE) == STATE_TYPE_LINK) {
            outgoingLinks[link.metadata.name] = link
        }
    }
    for (let cm of await GetConfigmaps()) {
        if (Controlled(cm) && Annotation(cm, META_ANNOTATION_STATE_TYPE) == STATE_TYPE_LINK) {
            backboneLinkConfigMaps[cm.metadata.name] = cm
            await checkLinkConfigMap("ADDED", cm);
        }
    }
}

function newLinkFor(cm) {
    let name = cm.metadata.name;
    let link = {
        apiVersion : 'skupper.io/v2alpha1',
        kind       : 'Link',
        metadata : {
            name : name,
            annotations : {
                [META_ANNOTATION_STATE_ID]   : Annotation(cm, META_ANNOTATION_STATE_ID),
                [META_ANNOTATION_STATE_DIR]  : Annotation(cm, META_ANNOTATION_STATE_DIR),
                [META_ANNOTATION_STATE_HASH] : Annotation(cm, META_ANNOTATION_STATE_HASH),
                [META_ANNOTATION_STATE_KEY]  : Annotation(cm, META_ANNOTATION_STATE_KEY),
                [META_ANNOTATION_STATE_TYPE] : Annotation(cm, META_ANNOTATION_STATE_TYPE),
            },
        },
        spec: {
            cost: parseInt(cm.data.cost, 10),
            endpoints: [{
                group: 'skupper-router',
                host: cm.data.host,
                name: 'inter-router',
                port: cm.data.port,
            }],
            tlsCredentials: backboneClientSecret,
        },
    };
    return link;
}

async function deleteLink(name) {
    try{
        Log(`Deleting Skupper Link: ${name}`)
        DeleteLink(name)
        delete backboneLinkConfigMaps[name]
        delete outgoingLinks[name]
    } catch (ex) {
        Log(`Error deleting Skupper Link: ${name} - ${ex}`)
    }
}

async function checkLinkConfigMap(oper, obj) {
    if (!Controlled(obj) || Annotation(obj, META_ANNOTATION_STATE_TYPE) != STATE_TYPE_LINK) {
        return;
    }
    let name = obj.metadata.name
    if (oper == "DELETED") {
        await deleteLink(name)
        return
    }
    let existing = undefined;
    if (name in outgoingLinks) {
        existing = outgoingLinks[name]
    }
    if (!existing) {
        try {
            let link = newLinkFor(obj)
            outgoingLinks[name] = await ApplyObject(link)
            backboneLinkConfigMaps[name] = obj
        } catch (ex) {
            Log(`Error creating Skupper Link: ${name} - ${ex}`)
        }
    } else {
        let link = await GetLink(name)
        const cmHash = Annotation(obj, META_ANNOTATION_STATE_HASH);
        const linkHash = Annotation(link, META_ANNOTATION_STATE_HASH);
        if (cmHash != linkHash) {
            try {
                Log(`Updating Skupper Link ${name} - hash changed`)
                let newLink = newLinkFor(obj)
                link.metadata.annotations[META_ANNOTATION_STATE_HASH] = cmHash
                link.spec = newLink.spec
                outgoingLinks[name] = await UpdateLink(link)
                backboneLinkConfigMaps[name] = obj
            } catch (ex) {
                Log(`Error updating Skupper Link: ${name} - ${ex}`)
            }
        }
    }
}

async function deleteUnnecessaryLinks() {
    for (const linkName of Object.keys(outgoingLinks)) {
        if (!(linkName in backboneLinkConfigMaps)) {
            await deleteLink(linkName)
        }
    }
}

export async function Start () {
    Log('[Links-V2 module started]');
    await loadBackboneClientSecret()
    await loadExistingOutgoingLinks()
    await deleteUnnecessaryLinks()
    WatchConfigMaps(checkLinkConfigMap)
}
