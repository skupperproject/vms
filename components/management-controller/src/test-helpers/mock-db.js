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

import { vi } from 'vitest';

const SYSTEM_QUERIES = new Set(['BEGIN', 'COMMIT', 'ROLLBACK']);

/**
 * Create a mock pg client whose `query` runs `handler` after session bootstrap queries.
 */
export function createMockClient(handler) {
    return {
        query: vi.fn(async (sql, params) => {
            if (SYSTEM_QUERIES.has(sql)) {
                return {};
            }
            if (sql.includes('INSERT INTO Users')) {
                return { rows: [{ id: 'internal-user-1' }] };
            }
            if (sql.includes('set_config')) {
                return {};
            }
            if (handler) {
                return handler(sql, params);
            }
            return { rows: [], rowCount: 0 };
        }),
        release: vi.fn(),
    };
}

export const TEST_UUIDS = {
    backbone: '00000000-0000-4000-8000-000000000001',
    van: '00000000-0000-4000-8000-000000000002',
    site: '00000000-0000-4000-8000-000000000003',
    accessPoint: '00000000-0000-4000-8000-000000000004',
    invitation: '00000000-0000-4000-8000-000000000005',
    member: '00000000-0000-4000-8000-000000000006',
    cert: '00000000-0000-4000-8000-000000000007',
};
