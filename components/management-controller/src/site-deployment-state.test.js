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

import { describe, it, expect, vi } from 'vitest';
import { SiteLifecycleChanged_TX } from './site-deployment-state.js';

const SITE_SELECT = 'SELECT Id, Lifecycle, DeploymentState, CoLocated FROM InteriorSites WHERE Id = $1';

describe('SiteLifecycleChanged_TX', () => {
    it('sets deployment state to deployed when lifecycle is active', async () => {
        const notify = { update: vi.fn() };
        const client = {
            query: vi.fn(async (sql) => {
                if (sql === SITE_SELECT) {
                    return {
                        rowCount: 1,
                        rows: [{
                            id: 'site-1',
                            lifecycle: 'active',
                            deploymentstate: 'not-ready',
                            colocated: false,
                        }],
                    };
                }
                if (sql.includes('UPDATE InteriorSites SET DeploymentState')) {
                    return { rowCount: 1 };
                }
                return { rowCount: 0, rows: [] };
            }),
        };

        await SiteLifecycleChanged_TX(client, notify, 'site-1', 'active');

        expect(client.query).toHaveBeenCalledWith(
            'UPDATE InteriorSites SET DeploymentState = $1 WHERE Id = $2',
            ['deployed', 'site-1'],
        );
        expect(notify.update).toHaveBeenCalledWith('InteriorSites', 'site-1');
    });

    it('sets ready-bootstrap when lifecycle is ready with manage access points', async () => {
        const notify = { update: vi.fn() };
        const client = {
            query: vi.fn(async (sql) => {
                if (sql === SITE_SELECT) {
                    return {
                        rowCount: 1,
                        rows: [{
                            id: 'site-2',
                            lifecycle: 'ready',
                            deploymentstate: 'not-ready',
                            colocated: false,
                        }],
                    };
                }
                if (sql.includes('InterRouterLinks.Id FROM InterRouterLinks')) {
                    return { rowCount: 0, rows: [] };
                }
                if (sql.includes("Kind = 'manage'")) {
                    return {
                        rowCount: 1,
                        rows: [{ id: 'ap-1', lifecycle: 'pending' }],
                    };
                }
                if (sql.includes('UPDATE InteriorSites SET DeploymentState')) {
                    return { rowCount: 1 };
                }
                return { rowCount: 0, rows: [] };
            }),
        };

        await SiteLifecycleChanged_TX(client, notify, 'site-2', 'ready');

        expect(client.query).toHaveBeenCalledWith(
            'UPDATE InteriorSites SET DeploymentState = $1 WHERE Id = $2',
            ['ready-bootstrap', 'site-2'],
        );
    });

    it('sets colo-automatic when site is colocated', async () => {
        const notify = { update: vi.fn() };
        const client = {
            query: vi.fn(async (sql) => {
                if (sql === SITE_SELECT) {
                    return {
                        rowCount: 1,
                        rows: [{
                            id: 'site-3',
                            lifecycle: 'ready',
                            deploymentstate: 'not-ready',
                            colocated: true,
                        }],
                    };
                }
                if (sql.includes('UPDATE InteriorSites SET DeploymentState')) {
                    return { rowCount: 1 };
                }
                return { rowCount: 0, rows: [] };
            }),
        };

        await SiteLifecycleChanged_TX(client, notify, 'site-3', 'ready');

        expect(client.query).toHaveBeenCalledWith(
            'UPDATE InteriorSites SET DeploymentState = $1 WHERE Id = $2',
            ['colo-automatic', 'site-3'],
        );
    });
});
