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

vi.mock('@skupperx/modules/kube', () => ({
    ApplyObject: vi.fn(),
    DeleteSecret: vi.fn(),
    DeleteConfigmap: vi.fn(),
    LoadConfigmap: vi.fn(),
    Controlled: vi.fn(() => false),
    LoadSecret: vi.fn(),
}));

vi.mock('@skupperx/modules/amqp', () => ({
    OpenConnection: vi.fn(),
    OpenSender: vi.fn(),
    Request: vi.fn(),
    CloseConnection: vi.fn(),
}));

describe('claim', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('GetClaimState returns the initial awaiting-name state', async () => {
        const { GetClaimState } = await import('./claim.js');
        expect(GetClaimState()).toMatchObject({
            interactive: true,
            status: 'awaiting-name',
            siteName: null,
        });
    });

    it('SetInteractiveName stores the site name before claim processing fails', async () => {
        const { SetInteractiveName, GetClaimState } = await import('./claim.js');
        const kube = await import('@skupperx/modules/kube');

        kube.LoadConfigmap.mockResolvedValue(null);

        await expect(SetInteractiveName('member-site')).rejects.toThrow();

        expect(GetClaimState().siteName).toBe('member-site');
        expect(GetClaimState().status).toBe('failed');
    });
});
