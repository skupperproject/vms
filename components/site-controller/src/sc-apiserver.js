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

import { IncomingForm } from 'formidable';
import express from 'express';
import cors from 'cors';
import { GetIngressBundleV2 } from './ingress-v2.js';
import { GetClaimState, SetInteractiveName } from './claim.js';
import { ValidateAndNormalizeFields } from '@skupperx/modules/util'
import { Log } from '@skupperx/modules/log'
import { Initialize as initializeMemberApi } from './api-member.js';
import { GetApiPort } from './router-port.js';

const API_PREFIX = '/api/v1alpha1/';
var api;

const getHostnames = function(res) {
    let ingress_bundle = GetIngressBundleV2();
    res.status(200).json(ingress_bundle);
    return 200;
}

const getSiteStatus = function(res) {
    const claimState = GetClaimState();
    res.status(200).json(claimState);
    return 200;
}

const startClaim = async function(req, res) {
    var returnStatus;
    const form = new IncomingForm();
    try {
        const [fields, files] = await form.parse(req);
        const norm = ValidateAndNormalizeFields(fields, {
            'name' : {type: 'dnsname', optional: false},
        });

        const actualName = await SetInteractiveName(norm.name);
        returnStatus = 201;
        res.status(returnStatus).json({ name : actualName });
    } catch (error) {
        returnStatus = 400;
        res.status(returnStatus).json({ message : error.message });
    }

    return returnStatus;
}

const apiLog = function(req, status) {
    Log(`SiteAPI: ${req.ip} - (${status}) ${req.method} ${req.originalUrl}`);
}

export function createApiApp() {
    const app = express();
    app.use(cors());
    return app;
}

/**
 * Register site-controller HTTP routes on an Express app (no port binding).
 * @param {import('express').Express} app
 * @param {{ backboneMode?: boolean, includeMemberApi?: boolean }} [options]
 */
export async function Initialize(app, { backboneMode = false, includeMemberApi = true } = {}) {
    app.get('/healthz', (req, res) => {
        res.send('OK');
        res.status(200).end();
    });

    if (backboneMode) {
        app.get(API_PREFIX + 'hostnames', (req, res) => {
            apiLog(req, getHostnames(res));
        });
    } else {
        app.get(API_PREFIX + 'site/status', (req, res) => {
            apiLog(req, getSiteStatus(res));
        });

        app.put(API_PREFIX + 'site/start', async (req, res) => {
            apiLog(req, await startClaim(req, res));
        });
    }

    if (includeMemberApi) {
        await initializeMemberApi(app);
    }
}

export async function Start(backboneMode, platform) {
    Log('[API Server module started]');
    api = createApiApp();
    await Initialize(api, { backboneMode, includeMemberApi: true });

    let server = api.listen(GetApiPort(), () => {
        let host = server.address().address;
        let port = server.address().port;
        if (host[0] == ':') {
            host = '[' + host + ']';
        }
        Log(`API Server listening on http://${host}:${port}`);
    });
}
