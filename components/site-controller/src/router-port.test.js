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

describe('router-port', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('GetApiPort returns the fixed site-controller API port', async () => {
        const { GetApiPort } = await import('./router-port.js');
        expect(GetApiPort()).toBe(1040);
    });

    it('AllocatePort skips reserved ports and reuses freed ports', async () => {
        const { AllocatePort, FreePort, TakePort } = await import('./router-port.js');

        expect(AllocatePort()).toBe(1050);
        const freed = AllocatePort();
        expect(freed).toBe(1051);

        FreePort(freed);
        TakePort(5672);
        TakePort(9090);

        expect(AllocatePort()).toBe(freed);
        expect(AllocatePort()).toBe(1052);
        expect(AllocatePort()).toBe(1053);
    });

    it('FreePort ignores ports below the ephemeral range', async () => {
        const { AllocatePort, FreePort } = await import('./router-port.js');

        const first = AllocatePort();
        FreePort(80);
        expect(AllocatePort()).toBe(first + 1);
    });
});
