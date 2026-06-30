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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
};

vi.mock('@skupperx/modules/kube', () => ({
    LoadSecret: vi.fn(),
}));

vi.mock('@skupperx/modules/amqp', () => ({
    OpenConnection: vi.fn(() => ({ id: 'mock-conn' })),
    CloseConnection: vi.fn(),
}));

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock('./notify.js', () => ({
    NotifyTransaction: class {
        add() {}
        async commit() {}
    },
    RegisterNotification: vi.fn(),
}));

import { LoadSecret } from '@skupperx/modules/kube';
import { OpenConnection } from '@skupperx/modules/amqp';
import { RegisterNotification } from './notify.js';

describe('RegisterHandler', () => {
    let Start;
    let RegisterHandler;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockClient.query.mockReset();
        vi.resetModules();
        ({ Start, RegisterHandler } = await import('./backbone-links.js'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('notifies registered handlers for existing and new backbone connections', async () => {
        const onAdded = vi.fn();
        const onDeleted = vi.fn();

        LoadSecret.mockResolvedValue({
            data: {
                'ca.crt': Buffer.from('ca').toString('base64'),
                'tls.crt': Buffer.from('cert').toString('base64'),
                'tls.key': Buffer.from('key').toString('base64'),
            },
        });

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name = $1 and LifeCycle')) {
                return {
                    rowCount: 1,
                    rows: [{ name: 'test-controller', certificate: 'cert-1' }],
                };
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name')) {
                return {
                    rowCount: 1,
                    rows: [{ name: 'test-controller', certificate: 'cert-1' }],
                };
            }
            if (sql.includes('SELECT ObjectName FROM TlsCertificates')) {
                return { rowCount: 1, rows: [{ objectname: 'tls-secret' }] };
            }
            if (sql.includes('BackboneAccessPoints AS ap')) {
                return {
                    rows: [{
                        id: 'ap-1',
                        hostname: 'router.example.com',
                        port: 5671,
                        colocated: false,
                    }],
                };
            }
            return { rows: [] };
        });

        await Start('test-controller');
        await vi.runOnlyPendingTimersAsync();
        await vi.runOnlyPendingTimersAsync();

        await RegisterHandler(onAdded, onDeleted);

        expect(onAdded).toHaveBeenCalledWith(
            'ap-1',
            expect.objectContaining({ id: 'mock-conn' }),
        );
        expect(onDeleted).not.toHaveBeenCalled();
    });
});

describe('resolveControllerRecord (via Start)', () => {
    let Start;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockClient.query.mockReset();
        vi.resetModules();
        ({ Start } = await import('./backbone-links.js'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('inserts a management controller record when none exists', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name')) {
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes('INSERT INTO ManagementControllers')) {
                expect(params).toEqual(['test-controller']);
                return { rows: [{ id: 'mc-id-1' }] };
            }
            return {};
        });

        await Start('test-controller');

        expect(mockClient.query).toHaveBeenCalledWith(
            'INSERT INTO ManagementControllers (Name) VALUES ($1) RETURNING Id',
            ['test-controller'],
        );
        expect(mockClient.release).toHaveBeenCalled();
        expect(RegisterNotification).toHaveBeenCalledWith('BackboneAccessPoints', expect.any(Function), false);
        expect(vi.getTimerCount()).toBe(2);
    });

    it('schedules TLS resolution immediately when controller record exists', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name')) {
                return { rowCount: 1, rows: [{ name: 'test-controller', certificate: 'cert-1' }] };
            }
            return {};
        });

        await Start('test-controller');

        expect(mockClient.query).not.toHaveBeenCalledWith(
            'INSERT INTO ManagementControllers (Name) VALUES ($1) RETURNING Id',
            expect.anything(),
        );
        expect(mockClient.release).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(2);
    });

    it('reschedules on error and rolls back the transaction', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN') {
                return {};
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name')) {
                throw new Error('database unavailable');
            }
            if (sql === 'ROLLBACK') {
                return {};
            }
            return {};
        });

        await Start('test-controller');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(2);

        await vi.advanceTimersByTimeAsync(10000);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    });

    it('chains through resolveTLSData and reconcileBackboneConnections', async () => {
        LoadSecret.mockResolvedValue({
            data: {
                'ca.crt': Buffer.from('ca').toString('base64'),
                'tls.crt': Buffer.from('cert').toString('base64'),
                'tls.key': Buffer.from('key').toString('base64'),
            },
        });

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name = $1 and LifeCycle')) {
                return {
                    rowCount: 1,
                    rows: [{ name: 'test-controller', certificate: 'cert-1' }],
                };
            }
            if (sql.includes('SELECT * FROM ManagementControllers WHERE Name')) {
                return {
                    rowCount: 1,
                    rows: [{ name: 'test-controller', certificate: 'cert-1' }],
                };
            }
            if (sql.includes('SELECT ObjectName FROM TlsCertificates')) {
                return { rowCount: 1, rows: [{ objectname: 'tls-secret' }] };
            }
            if (sql.includes('BackboneAccessPoints AS ap')) {
                return {
                    rows: [{
                        id: 'ap-1',
                        hostname: 'router.example.com',
                        port: 5671,
                        colocated: false,
                    }],
                };
            }
            return { rows: [] };
        });

        await Start('test-controller');
        await vi.runOnlyPendingTimersAsync();
        await vi.runOnlyPendingTimersAsync();

        expect(LoadSecret).toHaveBeenCalledWith('tls-secret');
        expect(OpenConnection).toHaveBeenCalledWith(
            'Backbone-management-ap-1',
            'router.example.com',
            5671,
            'tls',
            expect.any(Buffer),
            expect.any(Buffer),
            expect.any(Buffer),
        );
        expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);
    });
});
