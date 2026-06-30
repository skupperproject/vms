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

vi.mock('./log.js', () => ({
    Log: vi.fn(),
}));

describe('amqp', () => {
    const sentMessages = [];
    let mockAmqpConnection;

    beforeEach(async () => {
        vi.clearAllMocks();
        sentMessages.length = 0;
        vi.resetModules();

        mockAmqpConnection = {
            open_receiver: vi.fn(),
            open_sender: vi.fn(() => ({
                send: vi.fn((message) => sentMessages.push(message)),
            })),
            close: vi.fn(),
        };

        const mockContainer = {
            options: {},
            connect: vi.fn(() => mockAmqpConnection),
            on: vi.fn(),
        };

        const amqp = await import('./amqp.js');
        await amqp.Start(mockContainer);
    });

    it('OpenConnection configures host, port, and TLS options', async () => {
        const { OpenConnection } = await import('./amqp.js');
        const conn = OpenConnection('test-conn', 'router.example.com', 5671, 'tls', 'ca', 'cert', 'key');

        expect(conn.logName).toBe('test-conn');
        expect(mockAmqpConnection.open_receiver).toHaveBeenCalledWith({ source: { dynamic: true } });
        expect(mockAmqpConnection.open_sender).toHaveBeenCalled();
        expect(conn.amqpConnection.skxConn).toBe(conn);
    });

    it('SendMessage attaches reply address and body', async () => {
        const { OpenConnection, SendMessage } = await import('./amqp.js');
        const conn = OpenConnection('test-conn', 'localhost', 5672);
        conn.replyTo = 'dynamic-reply-address';
        const sender = {
            conn,
            amqpSender: { send: vi.fn() },
        };

        SendMessage(sender, { op: 'GET' }, { trace: true }, 'dest-address');

        expect(sender.amqpSender.send).toHaveBeenCalledWith(expect.objectContaining({
            body: { op: 'GET' },
            reply_to: 'dynamic-reply-address',
            application_properties: { trace: true },
            to: 'dest-address',
        }));
    });

    it('CloseConnection closes the underlying AMQP connection', async () => {
        const { OpenConnection, CloseConnection } = await import('./amqp.js');
        const conn = OpenConnection('test-conn', 'localhost', 5672);

        CloseConnection(conn);

        expect(mockAmqpConnection.close).toHaveBeenCalled();
    });
});
