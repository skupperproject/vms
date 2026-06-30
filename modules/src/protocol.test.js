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
import {
    Heartbeat,
    GetState,
    GetStateResponseSuccess,
    AssertClaim,
    AssertClaimResponseSuccess,
    ReponseFailure,
    SourceSite,
    DispatchMessage,
} from './protocol.js';

describe('protocol message builders', () => {
    it('Heartbeat includes optional hashset', () => {
        expect(Heartbeat('site-1', 'backbone', null, 1)).toEqual({
            version: 1,
            op: 'HB',
            site: 'site-1',
            sclass: 'backbone',
            seq: 1,
            address: '',
        });

        expect(Heartbeat('site-1', 'member', { key: 'hash' }, 2, 'addr')).toEqual({
            version: 1,
            op: 'HB',
            site: 'site-1',
            sclass: 'member',
            seq: 2,
            address: 'addr',
            hashset: { key: 'hash' },
        });
    });

    it('GetState builds a state request', () => {
        expect(GetState('site-1', 'tls-site-abc')).toEqual({
            version: 1,
            op: 'GET',
            site: 'site-1',
            statekey: 'tls-site-abc',
        });
    });

    it('GetStateResponseSuccess wraps state payload', () => {
        expect(GetStateResponseSuccess('tls-site-abc', 'hash-1', { host: 'h' })).toEqual({
            statusCode: 200,
            statusDescription: 'OK',
            statekey: 'tls-site-abc',
            hash: 'hash-1',
            data: { host: 'h' },
        });
    });

    it('AssertClaim builds a claim request', () => {
        expect(AssertClaim('claim-1', 'member-site')).toEqual({
            version: 1,
            op: 'CLAIM',
            claim: 'claim-1',
            name: 'member-site',
        });
    });

    it('AssertClaimResponseSuccess wraps claim acceptance payload', () => {
        expect(AssertClaimResponseSuccess('site-id', [{ id: 'link-1' }], { kind: 'Secret' })).toEqual({
            statusCode: 200,
            statusDescription: 'OK',
            siteId: 'site-id',
            outgoingLinks: [{ id: 'link-1' }],
            siteClient: { kind: 'Secret' },
        });
    });

    it('ReponseFailure wraps error status', () => {
        expect(ReponseFailure(403, 'Forbidden')).toEqual({
            statusCode: 403,
            statusDescription: 'Forbidden',
        });
    });
});

describe('SourceSite', () => {
    it('returns site id from heartbeat and get messages', () => {
        expect(SourceSite({ op: 'HB', site: 'site-a' })).toBe('site-a');
        expect(SourceSite({ op: 'GET', site: 'site-b' })).toBe('site-b');
    });

    it('throws for unsupported operations', () => {
        expect(() => SourceSite({ op: 'CLAIM', site: 'site-c' })).toThrow(
            'Can not determine source site-id from message',
        );
    });
});

describe('DispatchMessage', () => {
    it('dispatches heartbeat, get, and claim handlers', async () => {
        const onHeartbeat = vi.fn();
        const onGet = vi.fn();
        const onClaim = vi.fn();

        await DispatchMessage(
            { version: 1, op: 'HB', sclass: 'backbone', site: 'site-1', hashset: {}, seq: 3, address: 'addr' },
            onHeartbeat,
            onGet,
            onClaim,
        );
        expect(onHeartbeat).toHaveBeenCalledWith('backbone', 'site-1', {}, 3, 'addr');

        await DispatchMessage(
            { version: 1, op: 'GET', site: 'site-1', statekey: 'link-1' },
            onHeartbeat,
            onGet,
            onClaim,
        );
        expect(onGet).toHaveBeenCalledWith('site-1', 'link-1');

        await DispatchMessage(
            { version: 1, op: 'CLAIM', claim: 'claim-1', name: 'member-site' },
            onHeartbeat,
            onGet,
            onClaim,
        );
        expect(onClaim).toHaveBeenCalledWith('claim-1', 'member-site');
    });

    it('rejects unsupported protocol versions and op codes', async () => {
        await expect(DispatchMessage({ version: 99, op: 'HB' }, vi.fn(), vi.fn(), vi.fn()))
            .rejects.toThrow('Unsupported protocol version 99');

        await expect(DispatchMessage({ version: 1, op: 'UNKNOWN' }, vi.fn(), vi.fn(), vi.fn()))
            .rejects.toThrow('Unknown op-code UNKNOWN');
    });
});
