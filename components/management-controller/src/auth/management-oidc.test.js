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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as client from 'openid-client';
import * as jose from 'jose';

vi.mock('openid-client', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        discovery: vi.fn(),
    };
});

vi.mock('jose', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createRemoteJWKSet: vi.fn(() => ({})),
        jwtVerify: vi.fn(),
    };
});

import {
    allowsInsecureOidcRequests,
    realmIssuerHref,
    isApiStyleRequest,
    tokenMatchesClient,
    createManagementOidcAuth,
} from './management-oidc.js';

function writeKeycloakConfig(dir, overrides = {}) {
    const config = {
        realm: 'test-realm',
        'auth-server-url': 'http://mock-oidc:8080',
        'ssl-required': 'none',
        resource: 'vms-test-client',
        credentials: { secret: 'test-secret' },
        ...overrides,
    };
    const configPath = path.join(dir, 'keycloak.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
}

describe('allowsInsecureOidcRequests', () => {
    it('returns true when ssl-required is none', () => {
        const adapter = { 'ssl-required': 'none', 'auth-server-url': 'https://idp.example', realm: 'r' };
        expect(allowsInsecureOidcRequests(adapter, new URL('https://idp.example/realms/r'))).toBe(true);
    });

    it('returns true for http issuer when ssl-required is not none', () => {
        const adapter = { 'auth-server-url': 'http://mock-oidc:8080', realm: 'r' };
        expect(allowsInsecureOidcRequests(adapter, new URL('http://mock-oidc:8080/realms/r'))).toBe(true);
    });

    it('returns false for https issuer without ssl-required none', () => {
        const adapter = { 'auth-server-url': 'https://idp.example', realm: 'r' };
        expect(allowsInsecureOidcRequests(adapter, new URL('https://idp.example/realms/r'))).toBe(false);
    });
});

describe('realmIssuerHref', () => {
    it('builds realm issuer URL without trailing slash on auth-server-url', () => {
        expect(realmIssuerHref({
            realm: 'vms-test',
            'auth-server-url': 'http://mock-oidc:8080/',
        })).toBe('http://mock-oidc:8080/realms/vms-test');
    });
});

describe('isApiStyleRequest', () => {
    it('treats /api paths as API style', () => {
        expect(isApiStyleRequest({ path: '/api/v1alpha1/backbones', headers: {} })).toBe(true);
    });

    it('treats Accept application/json as API style', () => {
        expect(isApiStyleRequest({
            path: '/',
            headers: { accept: 'application/json' },
        })).toBe(true);
    });
});

describe('tokenMatchesClient', () => {
    it('matches azp claim', () => {
        expect(tokenMatchesClient({ azp: 'my-client' }, 'my-client')).toBe(true);
    });

    it('matches aud array', () => {
        expect(tokenMatchesClient({ aud: ['other', 'my-client'] }, 'my-client')).toBe(true);
    });
});

describe('createManagementOidcAuth', () => {
    /** @type {string} */
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oidc-test-'));
        vi.mocked(client.discovery).mockResolvedValue({
            serverMetadata: () => ({ issuer: 'http://mock-oidc:8080/realms/test-realm' }),
        });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('throws when keycloak.json has no client secret', async () => {
        const configPath = writeKeycloakConfig(tmpDir, { credentials: {} });
        await expect(createManagementOidcAuth({ configPath })).rejects.toThrow(
            'keycloak.json must include credentials.secret',
        );
    });

    it('passes allowInsecureRequests to discovery for http test IdP', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        await createManagementOidcAuth({ configPath });

        expect(client.discovery).toHaveBeenCalledWith(
            new URL('http://mock-oidc:8080/realms/test-realm'),
            'vms-test-client',
            'test-secret',
            undefined,
            { execute: [client.allowInsecureRequests] },
        );
    });

    it('omits insecure discovery options for https production IdP', async () => {
        const configPath = writeKeycloakConfig(tmpDir, {
            'auth-server-url': 'https://idp.example.com',
            'ssl-required': 'external',
        });
        vi.mocked(client.discovery).mockResolvedValue({
            serverMetadata: () => ({ issuer: 'https://idp.example.com/realms/test-realm' }),
        });

        await createManagementOidcAuth({ configPath });

        expect(client.discovery).toHaveBeenCalledWith(
            new URL('https://idp.example.com/realms/test-realm'),
            'vms-test-client',
            'test-secret',
            undefined,
            undefined,
        );
    });

    it('protect returns 401 for unauthenticated API requests', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        const auth = await createManagementOidcAuth({ configPath });

        const req = { path: '/api/v1alpha1/', headers: { accept: 'application/json' } };
        const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
        const next = vi.fn();

        await auth.protect()(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.send).toHaveBeenCalledWith('Unauthorized');
        expect(next).not.toHaveBeenCalled();
    });

    it('creates remote JWKS for token verification', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        await createManagementOidcAuth({ configPath });

        expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
            new URL('http://mock-oidc:8080/realms/test-realm/protocol/openid-connect/certs'),
        );
    });

    it('middleware attaches kauth from a valid bearer token', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        vi.mocked(jose.jwtVerify).mockResolvedValue({
            payload: {
                sub: 'user-1',
                azp: 'vms-test-client',
                realm_access: { roles: ['admin'] },
            },
        });

        const auth = await createManagementOidcAuth({ configPath });
        const req = {
            headers: { authorization: 'Bearer test.jwt.token' },
        };
        const next = vi.fn();

        await auth.middleware(req, {}, next);

        expect(jose.jwtVerify).toHaveBeenCalled();
        expect(req.kauth.grant.access_token.content.sub).toBe('user-1');
        expect(next).toHaveBeenCalled();
    });

    it('protect returns 403 when required realm role is missing', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        const auth = await createManagementOidcAuth({ configPath });

        const req = {
            path: '/api/v1alpha1/backbones',
            headers: { accept: 'application/json' },
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'user-1',
                            realm_access: { roles: ['viewer'] },
                        },
                    },
                },
            },
        };
        const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
        const next = vi.fn();

        await auth.protect('realm:admin')(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.send).toHaveBeenCalledWith('Forbidden');
        expect(next).not.toHaveBeenCalled();
    });

    it('protect allows access when required realm role is present', async () => {
        const configPath = writeKeycloakConfig(tmpDir);
        const auth = await createManagementOidcAuth({ configPath });

        const req = {
            kauth: {
                grant: {
                    access_token: {
                        content: {
                            sub: 'user-1',
                            realm_access: { roles: ['admin', 'viewer'] },
                        },
                    },
                },
            },
        };
        const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
        const next = vi.fn();

        await auth.protect('realm:admin')(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});
