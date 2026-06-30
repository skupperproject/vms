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

vi.mock('./db.js', () => ({
    ClientFromPool: vi.fn(async () => mockClient),
}));

vi.mock('./notify.js', () => ({
    NotifyTransaction: class {
        delete = vi.fn();
        async commit() {}
    },
}));

import { DeleteOrphanCertificates } from './prune.js';

describe('DeleteOrphanCertificates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return {};
            }
            if (sql.includes('SELECT Id, SignedBy FROM TlsCertificates')) {
                return { rows: [{ id: 'orphan-cert', signedby: null }] };
            }
            if (sql.includes('SELECT Id, Certificate FROM')) {
                return { rows: [] };
            }
            if (sql.startsWith('DELETE FROM TlsCertificates')) {
                return { rowCount: 1 };
            }
            return { rows: [] };
        });
    });

    it('deletes tls certificates not referenced by other tables', async () => {
        await DeleteOrphanCertificates();

        expect(mockClient.query).toHaveBeenCalledWith(
            'DELETE FROM TlsCertificates WHERE Id = $1',
            ['orphan-cert'],
        );
        expect(mockClient.release).toHaveBeenCalled();
    });
});
