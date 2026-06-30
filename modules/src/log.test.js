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
import { Log, Flush } from './log.js';

describe('log', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('Log writes strings with a timestamp prefix', () => {
        Log('hello from test');

        expect(console.log).toHaveBeenCalledTimes(1);
        expect(console.log.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* hello from test$/);
    });

    it('Log JSON-encodes non-string values', () => {
        Log({ level: 'info', message: 'structured' });

        expect(console.log.mock.calls[0][0]).toContain('{"level":"info","message":"structured"}');
    });

    it('Flush is a no-op', () => {
        expect(Flush()).toBeUndefined();
    });
});
