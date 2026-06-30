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

vi.mock('@skupperx/modules/kube', () => ({
    ApplyObject: vi.fn(),
}));

import { ApplyObject } from '@skupperx/modules/kube';

describe('api-member', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('POST /listeners creates a listener config map', async () => {
        mockFormFields = {
            name: 'listener-a',
            routingkey: 'app.frontend',
            host: 'frontend.example.com',
            port: '8080',
        };

        const { app } = await buildSiteApiApp({ backboneMode: true, includeMemberApi: true });

        await request(app)
            .post('/api/v1alpha1/listeners')
            .expect(201);

        expect(ApplyObject).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'ConfigMap',
            metadata: expect.objectContaining({ name: 'listener-a' }),
            data: expect.objectContaining({
                'routing-key': 'app.frontend',
                host: 'frontend.example.com',
                port: '8080',
            }),
        }));
    });

    it('POST /connectors creates a connector config map', async () => {
        mockFormFields = {
            name: 'connector-a',
            routingkey: 'app.backend',
            port: '8080',
            selector: 'app=backend',
        };

        const { app } = await buildSiteApiApp({ backboneMode: true, includeMemberApi: true });

        await request(app)
            .post('/api/v1alpha1/connectors')
            .expect(201);

        expect(ApplyObject).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'ConfigMap',
            metadata: expect.objectContaining({ name: 'connector-a' }),
            data: expect.objectContaining({
                'routing-key': 'app.backend',
                port: '8080',
                selector: 'app=backend',
            }),
        }));
    });

    it('GET /listeners returns not implemented', async () => {
        const { app } = await buildSiteApiApp({ backboneMode: true, includeMemberApi: true });

        const res = await request(app)
            .get('/api/v1alpha1/listeners')
            .expect(400);

        expect(res.text).toBe('Not Implemented');
    });
});
