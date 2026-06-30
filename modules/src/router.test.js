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

const mockRequest = vi.fn();

vi.mock('./amqp.js', () => ({
    Request: (...args) => mockRequest(...args),
    OpenSender: vi.fn(async (_logName, _conn, _address, onSendable) => {
        if (onSendable) {
            onSendable();
        }
        return { logName: 'Management' };
    }),
}));

vi.mock('./log.js', () => ({
    Log: vi.fn(),
}));

import { OpenSender } from './amqp.js';
import { RouterManagement } from './router.js';

describe('RouterManagement', () => {
    const conn = { id: 'mock-conn' };
    /** @type {RouterManagement} */
    let router;

    beforeEach(async () => {
        vi.clearAllMocks();
        router = new RouterManagement(conn);
        await router.start();
    });

    it('start opens the management sender and marks the router ready', async () => {
        expect(OpenSender).toHaveBeenCalledWith('Management', conn, '$management');
        expect(router.ready).toBe(true);
    });

    it('listListeners converts query results into objects', async () => {
        mockRequest.mockResolvedValue([{
            statusCode: 200,
        }, {
            attributeNames: ['name', 'port'],
            results: [['listener-a', 5672]],
        }]);

        const items = await router.listListeners(['name', 'port']);

        expect(items).toEqual([{ name: 'listener-a', port: 5672 }]);
        expect(mockRequest).toHaveBeenCalledWith(
            expect.anything(),
            { attributeNames: ['name', 'port'] },
            expect.objectContaining({
                operation: 'QUERY',
                entityType: 'io.skupper.router.listener',
            }),
            null,
            5,
        );
    });

    it('createListener throws on failure responses', async () => {
        mockRequest.mockResolvedValue([{
            statusCode: 409,
            statusDescription: 'Already exists',
        }, {}]);

        await expect(router.createListener('listener-a', {}))
            .rejects.toThrow('Already exists');
    });

    it('deleteListener succeeds on 204 responses', async () => {
        mockRequest.mockResolvedValue([{
            statusCode: 204,
        }, {}]);

        await expect(router.deleteListener('listener-a')).resolves.toBeUndefined();
    });
});
