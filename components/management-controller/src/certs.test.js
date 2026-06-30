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

const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
};

/** @type {Record<string, Function>} */
const notificationHandlers = {};

/** @type {Array<{ method: string, table: string, id: string }>} */
const notifyEvents = [];

vi.mock('@skupperx/modules/kube', () => ({
    ApplyObject: vi.fn(),
    LoadCertificate: vi.fn(),
    WatchSecrets: vi.fn(),
    WatchCertificates: vi.fn(),
    GetIssuers: vi.fn(async () => []),
}));

vi.mock('./config.js', () => ({
    BackboneExpiration: vi.fn(() => ({ years: 1 })),
    DefaultCaExpiration: vi.fn(() => ({ days: 30 })),
    DefaultCertExpiration: vi.fn(() => ({ days: 7 })),
    SiteControllerImage: vi.fn(() => 'quay.io/skupper/vms-site-controller:latest'),
    RootIssuer: vi.fn(() => 'skupperx-root'),
    CertOrganization: vi.fn(() => 'enterprise.com'),
}));

vi.mock('./sync-management.js', () => ({
    SiteCertificateChanged: vi.fn(),
    AccessCertificateChanged: vi.fn(),
}));

vi.mock('./claim-server.js', () => ({
    CompleteMember: vi.fn(),
}));

vi.mock('./site-deployment-state.js', () => ({
    AccessPointCertReady: vi.fn(),
    SiteLifecycleChanged_TX: vi.fn(),
}));

vi.mock('./watch-server.js', () => ({
    WatchNotify: vi.fn(),
}));

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(async () => mockClient),
    IntervalMilliseconds: vi.fn(() => 3600000),
}));

vi.mock('./notify.js', () => ({
    RegisterNotification: vi.fn((tableName, handler) => {
        notificationHandlers[tableName] = handler;
    }),
    NotifyTransaction: class {
        add(table, id) {
            notifyEvents.push({ method: 'add', table, id });
        }
        update(table, id) {
            notifyEvents.push({ method: 'update', table, id });
        }
        delete(table, id) {
            notifyEvents.push({ method: 'delete', table, id });
        }
        async commit() {}
    },
}));

import { Start } from './certs.js';
import { RegisterNotification } from './notify.js';
import { ApplyObject } from '@skupperx/modules/kube';

function transactionSql(sql) {
    return sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK';
}

describe('certs Start', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
    });

    it('registers notification handlers for certificate lifecycle tables', async () => {
        await Start();

        expect(RegisterNotification).toHaveBeenCalledWith(
            'ManagementControllers',
            expect.any(Function),
            true,
        );
        expect(RegisterNotification).toHaveBeenCalledWith('Backbones', expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith(
            'BackboneAccessPoints',
            expect.any(Function),
            true,
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            'ApplicationNetworks',
            expect.any(Function),
            true,
        );
        expect(RegisterNotification).toHaveBeenCalledWith(
            'NetworkCredentials',
            expect.any(Function),
            true,
        );
        expect(RegisterNotification).toHaveBeenCalledWith('InteriorSites', expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith(
            'MemberInvitations',
            expect.any(Function),
            true,
        );
        expect(RegisterNotification).toHaveBeenCalledWith('MemberSites', expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith(
            'CertificateRequests',
            expect.any(Function),
            false,
        );
    });
});

describe('onManagementControllersChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('creates mgmtController certificate request for new controller rows', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes("FROM ManagementControllers WHERE Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [{ id: 'mc-uuid-1', name: 'management-server-abc' }],
                };
            }
            if (sql.includes('INSERT INTO CertificateRequests')) {
                expect(params[1]).toBe('mc-uuid-1');
                return { rows: [{ id: 'cert-req-1' }] };
            }
            if (sql.includes("UPDATE ManagementControllers SET Lifecycle = 'skx_cr_created'")) {
                expect(params).toEqual(['mc-uuid-1']);
                return {};
            }
            return {};
        });

        await notificationHandlers.ManagementControllers('UPDATE', 'mc-uuid-1');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'mgmtController'"),
            expect.arrayContaining(['mc-uuid-1']),
        );
        expect(notifyEvents).toContainEqual({
            method: 'add',
            table: 'CertificateRequests',
            id: 'cert-req-1',
        });
        expect(notifyEvents).toContainEqual({
            method: 'update',
            table: 'ManagementControllers',
            id: 'mc-uuid-1',
        });
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('ignores DELETE actions', async () => {
        await notificationHandlers.ManagementControllers('DELETE', 'mc-uuid-1');
        expect(mockClient.query).not.toHaveBeenCalled();
    });
});

describe('onBackbonesChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('creates backboneCA certificate request for new backbone rows', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM Backbones WHERE id = $1')) {
                return {
                    rowCount: 1,
                    rows: [{ id: 'bb-uuid-1', name: 'backbone-a', lifecycle: 'new' }],
                };
            }
            if (sql.includes('INSERT INTO CertificateRequests')) {
                expect(params[1]).toBe('bb-uuid-1');
                return { rows: [{ id: 'cert-req-2' }] };
            }
            if (sql.includes("UPDATE Backbones SET Lifecycle = 'skx_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.Backbones('UPDATE', 'bb-uuid-1');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'backboneCA'"),
            expect.arrayContaining(['bb-uuid-1']),
        );
        expect(notifyEvents).toContainEqual({
            method: 'add',
            table: 'CertificateRequests',
            id: 'cert-req-2',
        });
        expect(notifyEvents).toContainEqual({
            method: 'update',
            table: 'Backbones',
            id: 'bb-uuid-1',
        });
    });

    it('notifies dependents when backbone lifecycle is ready', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM Backbones WHERE id = $1')) {
                return {
                    rowCount: 1,
                    rows: [{ id: 'bb-uuid-1', name: 'backbone-a', lifecycle: 'ready' }],
                };
            }
            if (sql.includes('FROM BackboneAccessPoints AS ap')) {
                return { rows: [{ id: 'ap-1' }] };
            }
            if (sql.includes('FROM ApplicationNetworks WHERE Backbone = $1')) {
                return { rows: [{ id: 'van-1' }] };
            }
            if (sql.includes('FROM InteriorSites WHERE Backbone = $1')) {
                return { rows: [{ id: 'site-1' }] };
            }
            if (sql.includes('FROM NetworkCredentials AS cred')) {
                return { rows: [{ id: 'cred-1' }] };
            }
            return {};
        });

        await notificationHandlers.Backbones('UPDATE', 'bb-uuid-1');

        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO CertificateRequests'),
            expect.anything(),
        );
        expect(notifyEvents).toEqual([
            { method: 'update', table: 'BackboneAccessPoints', id: 'ap-1' },
            { method: 'update', table: 'ApplicationNetworks', id: 'van-1' },
            { method: 'update', table: 'InteriorSites', id: 'site-1' },
            { method: 'update', table: 'NetworkCredentials', id: 'cred-1' },
        ]);
    });
});

describe('onCertificateRequestsChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('processes due certificate requests on ADD', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM CertificateRequests WHERE RequestTime')) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: 'cert-req-3',
                        requesttype: 'mgmtController',
                        durationhours: 8760,
                    }],
                };
            }
            if (sql.includes("UPDATE CertificateRequests SET Lifecycle = 'cm_cert_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.CertificateRequests('ADD', 'cert-req-3');

        expect(ApplyObject).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'Certificate',
                metadata: expect.objectContaining({
                    name: 'skx-mgmt-controller-cert-req-3',
                }),
            }),
        );
        expect(notifyEvents).toContainEqual({
            method: 'update',
            table: 'CertificateRequests',
            id: 'cert-req-3',
        });
    });

    it('ignores non-ADD actions', async () => {
        await notificationHandlers.CertificateRequests('UPDATE', 'cert-req-3');
        expect(mockClient.query).not.toHaveBeenCalled();
        expect(ApplyObject).not.toHaveBeenCalled();
    });
});

describe('onBackboneAccessPointsChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('creates accessPoint certificate request for new access points on ready backbones', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM BackboneAccessPoints') && sql.includes("Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: 'ap-uuid-1',
                        name: 'manage-ap',
                        hostname: 'router.example.com',
                        starttime: null,
                        endtime: null,
                        deletedelay: null,
                    }],
                };
            }
            if (sql.includes('INSERT INTO CertificateRequests')) {
                expect(params[1]).toBe('ap-uuid-1');
                return { rows: [{ id: 'cert-req-ap-1' }] };
            }
            if (sql.includes("UPDATE BackboneAccessPoints SET Lifecycle = 'skx_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.BackboneAccessPoints('UPDATE', 'ap-uuid-1');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'accessPoint'"),
            expect.arrayContaining(['ap-uuid-1']),
        );
        expect(notifyEvents).toContainEqual({
            method: 'add',
            table: 'CertificateRequests',
            id: 'cert-req-ap-1',
        });
    });
});

describe('onApplicationNetworksChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('creates vanCA certificate request for new application networks', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks') && sql.includes('Backbones.Lifecycle')) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: 'van-uuid-1',
                        name: 'van-a',
                        lifecycle: 'new',
                        starttime: new Date('2026-01-01T00:00:00Z'),
                        endtime: null,
                        deletedelay: null,
                        bbca: 'bb-ca-1',
                    }],
                };
            }
            if (sql.includes('INSERT INTO CertificateRequests')) {
                expect(params[2]).toBe('van-uuid-1');
                return { rows: [{ id: 'cert-req-van-1' }] };
            }
            if (sql.includes("UPDATE ApplicationNetworks SET Lifecycle = 'skx_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.ApplicationNetworks('UPDATE', 'van-uuid-1');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'vanCA'"),
            expect.arrayContaining(['van-uuid-1']),
        );
        expect(notifyEvents).toContainEqual({
            method: 'add',
            table: 'CertificateRequests',
            id: 'cert-req-van-1',
        });
    });

    it('notifies member invitations and sites when network becomes ready', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks') && sql.includes('Backbones.Lifecycle')) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: 'van-uuid-2',
                        name: 'van-b',
                        lifecycle: 'ready',
                        bbca: 'bb-ca-1',
                    }],
                };
            }
            if (sql.includes('FROM MemberInvitations WHERE MemberOf')) {
                return { rows: [{ id: 'invite-1' }] };
            }
            if (sql.includes('FROM MemberSites WHERE MemberOf')) {
                return { rows: [{ id: 'member-1' }] };
            }
            return {};
        });

        await notificationHandlers.ApplicationNetworks('UPDATE', 'van-uuid-2');

        expect(notifyEvents).toEqual([
            { method: 'update', table: 'MemberInvitations', id: 'invite-1' },
            { method: 'update', table: 'MemberSites', id: 'member-1' },
        ]);
    });
});

describe('onInteriorSitesChange', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        notifyEvents.length = 0;
        for (const key of Object.keys(notificationHandlers)) {
            delete notificationHandlers[key];
        }
        await Start();
    });

    it('creates interiorRouter certificate request for new interior sites', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (transactionSql(sql)) {
                return {};
            }
            if (sql.includes('FROM InteriorSites') && sql.includes("Lifecycle = 'new'")) {
                return {
                    rowCount: 1,
                    rows: [{
                        id: 'site-uuid-1',
                        name: 'backbone-site-a',
                        bbca: 'bb-ca-1',
                    }],
                };
            }
            if (sql.includes('INSERT INTO CertificateRequests')) {
                expect(params[1]).toBe('site-uuid-1');
                return { rows: [{ id: 'cert-req-site-1' }] };
            }
            if (sql.includes("UPDATE InteriorSites SET Lifecycle = 'skx_cr_created'")) {
                return {};
            }
            return {};
        });

        await notificationHandlers.InteriorSites('UPDATE', 'site-uuid-1');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("'interiorRouter'"),
            expect.arrayContaining(['site-uuid-1']),
        );
        expect(notifyEvents).toContainEqual({
            method: 'add',
            table: 'CertificateRequests',
            id: 'cert-req-site-1',
        });
    });
});
