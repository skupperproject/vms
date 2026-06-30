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

vi.mock('./amqp.js', () => ({
    OpenSender: vi.fn(() => ({ logName: 'sender' })),
    OpenReceiver: vi.fn(() => ({ logName: 'receiver' })),
    SendMessage: vi.fn(),
}));

vi.mock('./log.js', () => ({
    Log: vi.fn(),
}));

import {
    CLASS_BACKBONE,
    CLASS_MANAGEMENT,
    CLASS_MEMBER,
} from './state-sync.js';

const noopCallbacks = {
    onNewPeer: vi.fn(async () => [{}, {}]),
    onPeerLost: vi.fn(),
    onStateChange: vi.fn(),
    onStateRequest: vi.fn(async () => [null, null]),
    onPing: vi.fn(),
};

describe('state-sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('exports peer class constants', async () => {
        expect(CLASS_MANAGEMENT).toBe('management');
        expect(CLASS_BACKBONE).toBe('backbone');
        expect(CLASS_MEMBER).toBe('member');
    });

    it('UpdateLocalState ignores unknown peers', async () => {
        const stateSync = await import('./state-sync.js');
        await stateSync.Start(
            CLASS_MEMBER,
            'site-1',
            undefined,
            noopCallbacks.onNewPeer,
            noopCallbacks.onPeerLost,
            noopCallbacks.onStateChange,
            noopCallbacks.onStateRequest,
            noopCallbacks.onPing,
        );

        await expect(stateSync.UpdateLocalState('missing-peer', 'state-key', 'hash-1'))
            .resolves.toBeUndefined();
    });

    it('AddConnection rejects backbone connections without a local address', async () => {
        const stateSync = await import('./state-sync.js');
        await stateSync.Start(
            CLASS_BACKBONE,
            'site-1',
            undefined,
            noopCallbacks.onNewPeer,
            noopCallbacks.onPeerLost,
            noopCallbacks.onStateChange,
            noopCallbacks.onStateRequest,
            noopCallbacks.onPing,
        );

        await expect(stateSync.AddConnection('backbone-key', { logName: 'conn' }))
            .rejects.toThrow('Illegal adding of a backbone connection');
    });

    it('DeletePeer removes tracked peers', async () => {
        const stateSync = await import('./state-sync.js');
        await stateSync.Start(
            CLASS_MANAGEMENT,
            'mc',
            'skx/sync/mgmtcontroller',
            noopCallbacks.onNewPeer,
            noopCallbacks.onPeerLost,
            noopCallbacks.onStateChange,
            noopCallbacks.onStateRequest,
            noopCallbacks.onPing,
        );

        await stateSync.DeletePeer('site-1');
        await expect(stateSync.UpdateLocalState('site-1', 'state-key', 'hash-1'))
            .resolves.toBeUndefined();
    });
});
