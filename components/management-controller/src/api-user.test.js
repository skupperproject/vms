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
import { createMockClient, TEST_UUIDS } from './test-helpers/mock-db.js';
import { buildApiApp } from './test-helpers/build-api-app.js';

const mockClient = createMockClient();

vi.mock('./watch-server.js', () => ({
    WatchNotify: vi.fn(),
}));

vi.mock('./db.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ClientFromPool: vi.fn(async () => mockClient),
    };
});

describe('api-user', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockImplementation(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('INSERT INTO Users')) {
                return { rows: [{ id: 'internal-user-1' }] };
            }
            if (sql.includes('set_config')) {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks WHERE Backbone')) {
                return {
                    rows: [{
                        id: TEST_UUIDS.van,
                        name: 'van-a',
                        lifecycle: 'ready',
                        failure: null,
                        starttime: null,
                        endtime: null,
                        deletedelay: null,
                        networktype: 'standard',
                        connected: false,
                    }],
                };
            }
            if (sql.includes('JOIN Backbones ON Backbones.Id = Backbone')) {
                return {
                    rows: [{
                        id: TEST_UUIDS.van,
                        backbone: TEST_UUIDS.backbone,
                        backbonename: 'backbone-a',
                        name: 'van-a',
                        networktype: 'standard',
                        lifecycle: 'ready',
                        failure: null,
                        starttime: null,
                        endtime: null,
                        deletedelay: null,
                        connected: false,
                    }],
                };
            }
            if (sql.includes('JOIN Backbones ON ApplicationNetworks.Backbone = Backbones.Id WHERE ApplicationNetworks.Id')) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: TEST_UUIDS.van,
                        name: 'van-a',
                        backboneid: TEST_UUIDS.backbone,
                        backbonename: 'backbone-a',
                    }],
                };
            }
            return { rows: [], rowCount: 0 };
        });
    });

    it('GET /backbones/:bid/vans lists vans for a backbone', async () => {
        const { app } = await buildApiApp({ includeAdmin: false });

        const res = await request(app)
            .get(`/api/v1alpha1/backbones/${TEST_UUIDS.backbone}/vans`)
            .set('x-test-auth', '1')
            .expect(200);

        expect(res.body).toHaveLength(1);
        expect(res.body[0].name).toBe('van-a');
    });

    it('GET /vans lists all vans', async () => {
        const { app } = await buildApiApp({ includeAdmin: false });

        const res = await request(app)
            .get('/api/v1alpha1/vans')
            .set('x-test-auth', '1')
            .expect(200);

        expect(res.body[0].backbonename).toBe('backbone-a');
    });

    it('GET /vans/:vid returns a single van', async () => {
        const { app } = await buildApiApp({ includeAdmin: false });

        const res = await request(app)
            .get(`/api/v1alpha1/vans/${TEST_UUIDS.van}`)
            .set('x-test-auth', '1')
            .expect(200);

        expect(res.body.id).toBe(TEST_UUIDS.van);
    });

    it('GET /vans/:vid returns 400 when van is missing', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('INSERT INTO Users')) {
                return { rows: [{ id: 'internal-user-1' }] };
            }
            if (sql.includes('set_config')) {
                return {};
            }
            return { rowCount: 0, rows: [] };
        });

        const { app } = await buildApiApp({ includeAdmin: false });

        await request(app)
            .get(`/api/v1alpha1/vans/${TEST_UUIDS.van}`)
            .set('x-test-auth', '1')
            .expect(400);
    });

    it('GET /vans returns 401 without authentication', async () => {
        const { app } = await buildApiApp({ includeAdmin: false });

        await request(app)
            .get('/api/v1alpha1/vans')
            .expect(401);
    });

    it('GET /vans returns 403 without can-list-vans role', async () => {
        const { app } = await buildApiApp({
            includeAdmin: false,
            roles: ['van-owner'],
        });

        await request(app)
            .get('/api/v1alpha1/vans')
            .set('x-test-auth', '1')
            .expect(403);
    });
});
