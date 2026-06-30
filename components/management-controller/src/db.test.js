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
import { IntervalMilliseconds, isAdmin, extractUserInfo, queryWithContext } from './db.js';

describe('IntervalMilliseconds', () => {
    it('converts interval to milliseconds (min 1 hour)', () => {
        expect(IntervalMilliseconds({ years: 2 })).toBe(2 * (3600 * 24 * 365 * 1000));
        expect(IntervalMilliseconds({ weeks: 3 })).toBe(3 * (3600 * 24 * 7 * 1000));
        expect(IntervalMilliseconds({ days: 4 })).toBe(4 * (3600 * 24 * 1000));
        expect(IntervalMilliseconds({ hours: 2 })).toBe(2 * (3600 * 1000));
        expect(IntervalMilliseconds({ minutes: 65 })).toBe(65 * (60 * 1000));
        expect(IntervalMilliseconds({ seconds: 5400 })).toBe(5400 * (1000));
        expect(IntervalMilliseconds({ seconds: 1 })).toBe(3600000);
    });
});

describe('isAdmin', () => {
    it('detects admin role', () => {
        expect(isAdmin(['viewer', 'admin'])).toBe(true);
        expect(isAdmin(['viewer'])).toBe(false);
    });
});

describe('extractUserInfo', () => {
    it('reads OIDC token content', () => {
        const req = {
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'user-1',
                            clientGroups: ['group-a'],
                            realm_access: { roles: ['admin'] },
                        },
                    },
                },
            },
        };
        expect(extractUserInfo(req)).toEqual({
            context: 'admin',
            userId: 'user-1',
            userGroups: ['group-a'],
            isAdmin: true,
        });
    });

    it('returns defaults when token is absent', () => {
        expect(extractUserInfo({})).toEqual({
            context: 'user',
            userId: null,
            userGroups: [],
            isAdmin: false,
        });
    });
});

describe('queryWithContext', () => {
    /** @type {{ query: ReturnType<typeof vi.fn> }} */
    let mockClient;

    beforeEach(() => {
        mockClient = { query: vi.fn() };
    });

    async function runQueries(sql) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return {};
        }
        if (sql.includes('INSERT INTO Users')) {
            return { rows: [{ id: 'internal-user-1' }] };
        }
        if (sql.startsWith('SELECT set_config')) {
            return {};
        }
        return {};
    }

    it('sets RLS session variables and commits for authenticated users', async () => {
        mockClient.query.mockImplementation(runQueries);

        const req = {
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'keycloak-sub-1',
                            clientGroups: ['team-a', 'team-b'],
                            realm_access: { roles: ['viewer'] },
                        },
                    },
                },
            },
        };

        const result = await queryWithContext(req, mockClient, async (_client, ctx) => {
            expect(ctx.userId).toBe('internal-user-1');
            expect(ctx.userGroups).toEqual(['team-a', 'team-b']);
            return 'ok';
        });

        expect(result).toBe('ok');
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO Users'),
            ['keycloak-sub-1', false],
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            "SELECT set_config('session.user_id', $1, true)",
            ['internal-user-1'],
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            "SELECT set_config('session.user_groups', $1, true)",
            [['team-a', 'team-b']],
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            "SELECT set_config('session.is_admin', $1, true)",
            ['false'],
        );
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('sets is_admin true for admin users', async () => {
        mockClient.query.mockImplementation(runQueries);

        const req = {
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'admin-sub',
                            clientGroups: [],
                            realm_access: { roles: ['admin'] },
                        },
                    },
                },
            },
        };

        await queryWithContext(req, mockClient, async () => 'done');

        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO Users'),
            ['admin-sub', true],
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            "SELECT set_config('session.is_admin', $1, true)",
            ['true'],
        );
    });

    it('skips user upsert when unauthenticated', async () => {
        mockClient.query.mockImplementation(runQueries);

        await queryWithContext({}, mockClient, async (_client, ctx) => {
            expect(ctx.userId).toBeNull();
            return null;
        });

        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO Users'),
            expect.anything(),
        );
        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('set_config'),
            expect.anything(),
        );
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back when callback throws', async () => {
        mockClient.query.mockImplementation(runQueries);

        const req = {
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'user-sub',
                            realm_access: { roles: [] },
                        },
                    },
                },
            },
        };

        await expect(
            queryWithContext(req, mockClient, async () => {
                throw new Error('query failed');
            }),
        ).rejects.toThrow('query failed');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    });
});
