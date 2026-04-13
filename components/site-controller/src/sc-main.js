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

import * as k8s from '@kubernetes/client-node';
import yaml from 'yaml';
import fs from 'node:fs';
import rhea from 'rhea';
import * as kube from '@skupperx/modules/kube'
import * as amqp from '@skupperx/modules/amqp'
import * as apiserver from './sc-apiserver.js'
import * as syncKube from './sync-site-kube.js'
import * as router from '@skupperx/modules/router'
import * as links from './links.js'
import * as linksv2 from './links-v2.js'
import * as ingress_v1 from './ingress.js'
import * as ingress_v2 from './ingress-v2.js'
import * as claim from './claim.js'
import * as memberapi from './api-member.js'
import { Log, Flush } from '@skupperx/modules/log';

const VERSION              = '0.2.0';
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
        await apiserver.Start(BACKBONE_MODE, PLATFORM);

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
        let conn;
        if ( PLATFORM == 'sk2' ) {
            Log('Waiting for skupper-router pod to be Running...');
            if (!kube.waitPodsRunning(STANDALONE_NAMESPACE, 'application=skupper-router')) {
                Log('Skupper-router is not running, exiting');
                process.exit(1);
            }
            let certs = await GetLocalRouterCerts();
            conn = amqp.OpenConnection('LocalRouter', 'skupper-router-local', '5671', 'tls', certs.ca, certs.cert, certs.key);
        } else {
            conn = amqp.OpenConnection('LocalRouter');
        }
        await router.Start(conn);
        if (PLATFORM != 'sk2') {
            await links.Start(BACKBONE_MODE);
        }
        if (BACKBONE_MODE) {
            if (PLATFORM == 'sk2') {
                await ingress_v2.Start(site_id);
                await linksv2.Start();
            } else {
                await ingress_v1.Start(site_id, PLATFORM);
            }
        }
        await syncKube.Start(site_id, conn, BACKBONE_MODE, PLATFORM);
        Log("[Site controller initialization completed successfully]");
    } catch (error) {
        Log(`Site controller initialization failed: ${error.message}`)
        Log(error.stack);
        Flush();
        process.exit(1);
    };
}

async function GetLocalRouterCerts() {
    const secret = await kube.LoadSecret('skupper-local-server');
    let   count  = 0;
    let tls_ca, tls_cert, tls_key;
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
    return {
        ca   : tls_ca,
        cert : tls_cert,
        key  : tls_key,
    }
}
