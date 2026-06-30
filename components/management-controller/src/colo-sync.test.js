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

vi.mock('@skupperx/modules/kube', () => ({
    GetNamespaces: vi.fn(async () => []),
    createNamespace: vi.fn(),
    deleteNamespace: vi.fn(),
    LoadSecret: vi.fn(),
    ApplyObject: vi.fn(),
}));

vi.mock('./notify.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        RegisterNotification: vi.fn(actual.RegisterNotification),
    };
});

import { Start } from './colo-sync.js';
import { RegisterNotification } from './notify.js';
import { GetNamespaces } from '@skupperx/modules/kube';

describe('colo-sync Start', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads namespaces and registers change handlers', async () => {
        GetNamespaces.mockResolvedValue([{
            metadata: {
                name: 'colo-ns-1',
                annotations: { 'skupper.io/skupperx-controlled': 'true' },
            },
        }]);

        await Start();

        expect(GetNamespaces).toHaveBeenCalled();
        expect(RegisterNotification).toHaveBeenCalledWith('Backbones', expect.any(Function), true);
        expect(RegisterNotification).toHaveBeenCalledWith('InteriorSites', expect.any(Function), false);
        expect(RegisterNotification).toHaveBeenCalledWith('BackboneAccessPoints', expect.any(Function), false);
        expect(vi.getTimerCount()).toBe(2);
    });
});
