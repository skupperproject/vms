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

function mockMemberQueries({ withTemplates = false } = {}) {
    mockClient.query.mockImplementation(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return {};
        }
        if (sql.includes('MemberSites')) {
            return { rowCount: 1, rows: [{ memberof: 'van-1', siteclasses: ['default'] }] };
        }
        if (sql.includes('ApplicationTemplates')) {
            if (!withTemplates) {
                return { rows: [] };
            }
            return { rows: [{ atid: 'at-1', name: 'app-a' }] };
        }
        if (sql.includes('FROM Components')) {
            return {
                rows: [{
                    cid: 'comp-1',
                    ctid: 'ct-1',
                    name: 'frontend',
                    format: 'json',
                    spec: '{}',
                }],
            };
        }
        if (sql.includes('FROM Interfaces')) {
            return {
                rows: [{
                    iid: 'iface-1',
                    role: 'accept',
                    hostnameused: 'frontend.example.com',
                    actualport: 8080,
                    defaultport: 8080,
                    transportprotocol: 'tcp',
                    applicationprotocol: 'http',
                    bid: 'bind-1',
                    distribution: 'single',
                    scope: 'site',
                    vanaddress: 'app.frontend',
                }],
            };
        }
        return { rows: [] };
    });
}

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

import { onMewMember, StateRequest } from './sync-application.js';

describe('StateRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMemberQueries();
    });

    it('returns null hash and empty data for unknown state key', async () => {
        const [hash, data] = await StateRequest('member-1', 'missing-key');

        expect(hash).toBeNull();
        expect(data).toEqual({});
        expect(mockClient.release).toHaveBeenCalled();
    });
});

describe('onMewMember', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMemberQueries();
    });

    it('returns local state unchanged when member has no application templates', async () => {
        const localState = { existing: 'hash' };
        const remoteState = {};

        const [updatedLocal, updatedRemote] = await onMewMember('member-1', localState, remoteState);

        expect(updatedLocal).toEqual({ existing: 'hash' });
        expect(updatedRemote).toEqual({});
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('adds component and interface state hashes when templates exist', async () => {
        mockMemberQueries({ withTemplates: true });
        const localState = {};
        const remoteState = {};

        const [updatedLocal, updatedRemote] = await onMewMember('member-1', localState, remoteState);

        expect(Object.keys(updatedLocal)).toEqual(
            expect.arrayContaining(['component-comp-1', 'iface-accept-bind-1']),
        );
        expect(typeof updatedLocal['component-comp-1']).toBe('string');
        expect(updatedRemote).toEqual({});
    });
});

describe('StateRequest with cached application state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns cached hash and data after onMewMember populates state', async () => {
        mockMemberQueries({ withTemplates: true });

        await onMewMember('member-1', {}, {});

        const [hash, data] = await StateRequest('member-1', 'component-comp-1');

        expect(hash).toMatch(/^[a-f0-9]{40}$/);
        expect(data).toEqual(expect.objectContaining({
            id: 'comp-1',
            name: 'frontend',
        }));
    });
});
