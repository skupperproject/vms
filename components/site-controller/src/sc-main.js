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

import k8s from '@kubernetes/client-node';
import yaml from 'yaml';
import fs from 'node:fs';
import rhea from 'rhea';
import * as kube from '@skupperx/common/kube'
import * as amqp from '@skupperx/common/amqp'
import * as apiserver from './sc-apiserver.js'
import * as syncKube from './sync-site-kube.js'
import * as router from '@skupperx/common/router'
import * as links from './links.js'
import * as ingress_v1 from './ingress.js'
import * as ingress_v2 from './ingress-v2.js'
import * as claim from './claim.js'
import * as memberapi from './api-member.js'
import { Log, Flush } from '@skupperx/common/log';

const VERSION              = '0.1.3';
const STANDALONE_NAMESPACE = process.env.SKX_STANDALONE_NAMESPACE;
const BACKBONE_MODE        = (process.env.SKX_BACKBONE || 'NO') == 'YES';
const PLATFORM             = process.env.SKX_PLATFORM || 'unknown';
var   site_id              = process.env.SKUPPERX_SITE_ID || 'unknown';

Log(`Skupper-X Site controller version ${VERSION}`);
Log(`Backbone : ${BACKBONE_MODE}`);
Log(`Platform : ${PLATFORM}`)
if (STANDALONE_NAMESPACE) {
    Log(`Standalone Namespace : ${STANDALONE_NAMESPACE}`);
}

//
// This is the main program startup sequence.
//
export async function Main() {
    try {
        await kube.Start(k8s, fs, yaml, STANDALONE_NAMESPACE);
        await amqp.Start(rhea);

        //
        // Start the API server early so we don't cause readiness-probe problems.
        //
        await apiserver.Start(BACKBONE_MODE);

        if (!BACKBONE_MODE) {
            //
            // If we are in member mode, we must assert a claim (or use a previously accepted claim) to join an application network.
            // This function does not complete until after the claim has been asserted, accepted, and processed.  On subsequent
            // restarts of this controller after claim acceptance, the following function is effectively a no-op.
            //
            site_id = await claim.Start();
            await memberapi.Start();
        }

        Log(`Site-Id : ${site_id}`);
        let conn = amqp.OpenConnection('LocalRouter');
        await router.Start(conn);
        await links.Start(BACKBONE_MODE);
        if (BACKBONE_MODE) {
            if (PLATFORM == 'sk2') {
                await ingress_v2.Start(site_id);
            } else {
                await ingress_v1.Start(site_id, PLATFORM);
            }
        }
        await syncKube.Start(site_id, conn, BACKBONE_MODE);
        Log("[Site controller initialization completed successfully]");
    } catch (error) {
        Log(`Site controller initialization failed: ${error.message}`)
        Log(error.stack);
        Flush();
        process.exit(1);
    };
}
