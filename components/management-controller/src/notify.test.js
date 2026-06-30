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

vi.mock('./watch-server.js', () => ({
    WatchNotify: vi.fn(),
}));

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(),
}));

import { NotifyTransaction, RegisterNotification } from './notify.js';
import { WatchNotify } from './watch-server.js';

describe('NotifyTransaction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('dispatches add, update, and delete events on commit', async () => {
        const handler = vi.fn();
        await RegisterNotification('TestTable', handler, false);

        const notify = new NotifyTransaction();
        notify.add('TestTable', 'row-1');
        notify.update('TestTable', 'row-2');
        notify.delete('TestTable', 'row-3');
        await notify.commit();

        expect(handler).toHaveBeenCalledWith('ADD', 'row-1', 'TestTable');
        expect(handler).toHaveBeenCalledWith('UPDATE', 'row-2', 'TestTable');
        expect(handler).toHaveBeenCalledWith('DELETE', 'row-3', 'TestTable');
        expect(WatchNotify).toHaveBeenCalledTimes(3);
    });

    it('commit succeeds when no handlers are registered', async () => {
        const notify = new NotifyTransaction();
        notify.add('UnregisteredTable', 'row-1');
        await expect(notify.commit()).resolves.toBeUndefined();
    });
});
