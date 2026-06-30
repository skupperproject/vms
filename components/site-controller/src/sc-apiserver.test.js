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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildSiteApiApp } from './test-helpers/build-site-api-app.js';

let mockFormFields = {};

vi.mock('formidable', () => ({
    IncomingForm: class {
        parse() {
            return Promise.resolve([mockFormFields, {}]);
        }
    },
}));

vi.mock('./ingress-v2.js', () => ({
    GetIngressBundleV2: vi.fn(() => ({
        'ap-1': { host: 'ingress.example.com', port: 9090 },
    })),
}));

vi.mock('./claim.js', () => ({
    GetClaimState: vi.fn(() => ({
        interactive: true,
        status: 'awaiting-name',
        siteName: null,
    })),
    SetInteractiveName: vi.fn(async (name) => name),
}));

import { GetIngressBundleV2 } from './ingress-v2.js';
import { GetClaimState, SetInteractiveName } from './claim.js';

describe('sc-apiserver routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET /healthz returns OK', async () => {
        const { app } = await buildSiteApiApp({ backboneMode: true, includeMemberApi: false });

        const res = await request(app)
            .get('/healthz')
            .expect(200);

        expect(res.text).toBe('OK');
    });

    it('GET /hostnames returns the ingress bundle in backbone mode', async () => {
        const { app } = await buildSiteApiApp({ backboneMode: true, includeMemberApi: false });

        const res = await request(app)
            .get('/api/v1alpha1/hostnames')
            .expect(200);

        expect(res.body).toEqual({
            'ap-1': { host: 'ingress.example.com', port: 9090 },
        });
        expect(GetIngressBundleV2).toHaveBeenCalled();
    });

    it('GET /site/status returns claim state in member mode', async () => {
        const { app } = await buildSiteApiApp({ backboneMode: false, includeMemberApi: false });

        const res = await request(app)
            .get('/api/v1alpha1/site/status')
            .expect(200);

        expect(res.body.status).toBe('awaiting-name');
        expect(GetClaimState).toHaveBeenCalled();
    });

    it('PUT /site/start sets the interactive site name', async () => {
        mockFormFields = { name: 'member-site' };
        const { app } = await buildSiteApiApp({ backboneMode: false, includeMemberApi: false });

        const res = await request(app)
            .put('/api/v1alpha1/site/start')
            .expect(201);

        expect(res.body).toEqual({ name: 'member-site' });
        expect(SetInteractiveName).toHaveBeenCalledWith('member-site');
    });
});
