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

const mockListAddresses = vi.fn(async () => []);
const mockRouterStart = vi.fn(async () => {});

/** @type {Function | undefined} */
let capturedLinkAdded;

vi.mock('@skupperx/modules/router', () => ({
    RouterManagement: vi.fn().mockImplementation(function RouterManagement(conn) {
        this.conn = conn;
        this.start = mockRouterStart;
        this.listAddresses = mockListAddresses;
    }),
}));

vi.mock('./backbone-links.js', () => ({
    RegisterHandler: vi.fn((onAdded, onDeleted) => {
        capturedLinkAdded = onAdded;
        expect(onDeleted).toBeTypeOf('function');
    }),
}));

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock('./notify.js', () => ({
    NotifyTransaction: class {
        update() {}
        async commit() {}
    },
}));

import { RouterManagement } from '@skupperx/modules/router';
import { RegisterHandler } from './backbone-links.js';
import { Start } from './external-vans.js';

function mockNetworkQueries() {
    mockClient.query.mockImplementation(async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return {};
        }
        if (sql.includes('FROM ApplicationNetworks')) {
            return {
                rows: [{
                    id: 'net-uuid-1',
                    name: 'external-van-a',
                    vanid: 'van-network-1',
                    connected: false,
                }],
            };
        }
        if (sql.includes('UPDATE ApplicationNetworks SET Connected')) {
            expect(params).toEqual(['net-uuid-1', true]);
            return {};
        }
        return { rows: [] };
    });
}

describe('external-vans Start', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedLinkAdded = undefined;
        mockClient.query.mockReset();
        mockListAddresses.mockResolvedValue([]);
    });

    it('registers link handlers with backbone-links', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks')) {
                return { rows: [] };
            }
            return { rows: [] };
        });

        await Start();

        expect(RegisterHandler).toHaveBeenCalledWith(
            expect.any(Function),
            expect.any(Function),
        );
        expect(capturedLinkAdded).toBeTypeOf('function');
    });
});

describe('external VAN reconcile', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockClient.query.mockReset();
        capturedLinkAdded = undefined;
        mockListAddresses.mockResolvedValue([]);

        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks')) {
                return { rows: [] };
            }
            return { rows: [] };
        });

        await Start();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts a colocated router when a management link is added', async () => {
        const conn = { id: 'mock-conn' };

        await capturedLinkAdded('bb-1', conn, { colocated: true });

        expect(RouterManagement).toHaveBeenCalledWith(conn);
        expect(mockRouterStart).toHaveBeenCalled();
    });

    it('marks disconnected networks connected when router address appears', async () => {
        mockNetworkQueries();
        await capturedLinkAdded('bb-1', { id: 'conn' }, { colocated: true });
        mockListAddresses.mockResolvedValue([{ key: 'Nvan-network-1' }]);

        await vi.advanceTimersByTimeAsync(5000);

        expect(mockClient.query).toHaveBeenCalledWith(
            'UPDATE ApplicationNetworks SET Connected = $2 WHERE Id = $1',
            ['net-uuid-1', true],
        );
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('marks connected networks disconnected when router address disappears', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('FROM ApplicationNetworks')) {
                return {
                    rows: [{
                        id: 'net-uuid-2',
                        name: 'external-van-b',
                        vanid: 'van-network-2',
                        connected: true,
                    }],
                };
            }
            if (sql.includes('UPDATE ApplicationNetworks SET Connected')) {
                expect(params).toEqual(['net-uuid-2', false]);
                return {};
            }
            return { rows: [] };
        });

        await capturedLinkAdded('bb-1', { id: 'conn' }, { colocated: true });
        mockListAddresses.mockResolvedValue([]);

        await vi.advanceTimersByTimeAsync(5000);

        expect(mockClient.query).toHaveBeenCalledWith(
            'UPDATE ApplicationNetworks SET Connected = $2 WHERE Id = $1',
            ['net-uuid-2', false],
        );
    });
});
