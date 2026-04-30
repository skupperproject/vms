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

"use strict";

import * as client from "openid-client";
import * as jose from "jose";
import fs from "node:fs";
import path from "node:path";
import { Log } from "@skupperx/modules/log";

/**
 * Same-origin OAuth redirect path used in the authorization code flow.
 * Register in Keycloak as a Valid Redirect URI: `{baseUrl}/auth/callback`.
 * @readonly
 */
const OIDC_REDIRECT_PATH = "/auth/callback";

/**
 * Strip trailing slashes from an issuer or auth-server URL for stable string comparison.
 * @param {string} [s]
 * @returns {string}
 */
function normalizeIssuer(s) {
    return String(s || "").replace(/\/+$/, "");
}

/**
 * Resolve the filesystem path to Keycloak adapter JSON (`keycloak.json`).
 * Tries `/app/keycloak.json`, then `keycloak.json` in `process.cwd()`.
 * @returns {string}
 * @throws {Error} If no candidate file exists
 */
function resolveKeycloakConfigPath() {
    const candidates = ["/app/keycloak.json", path.join(process.cwd(), "keycloak.json")];
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return c;
        }
    }
    throw new Error(
        "keycloak.json not found; set KEYCLOAK_JSON or place keycloak.json in cwd or /app/keycloak.json",
    );
}

/**
 * Read and parse Keycloak OIDC adapter JSON (realm, auth-server-url, resource, credentials).
 * @param {string} configPath Absolute path to `keycloak.json`
 * @returns {object} Parsed adapter configuration
 */
function loadAdapterConfig(configPath) {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
}

/**
 * Build the realm issuer URL used for OIDC discovery (`{auth-server-url}/realms/{realm}`).
 * @param {{ realm: string, 'auth-server-url': string }} adapter Parsed Keycloak adapter config
 * @returns {string}
 */
function realmIssuerHref(adapter) {
    const base = normalizeIssuer(adapter["auth-server-url"]);
    return `${base}/realms/${adapter.realm}`;
}

/**
 * Extract a Bearer access token from the `Authorization` header, if present.
 * @param {import('express').Request} req
 * @returns {string | null} Raw JWT string without the `Bearer ` prefix
 */
function readBearer(req) {
    const h = req.headers.authorization;
    if (!h || typeof h !== "string" || !h.startsWith("Bearer ")) {
        return null;
    }
    return h.slice("Bearer ".length).trim() || null;
}

/**
 * Attach verified JWT claims to `req` in the legacy keycloak-connect shape (`req.kauth.grant.access_token.content`).
 * @param {import('express').Request} req
 * @param {import('jose').JWTPayload} payload Verified access token claims
 */
function attachKauthFromPayload(req, payload) {
    req.kauth = {
        grant: {
            access_token: {
                content: payload,
            },
        },
    };
}

/**
 * @param {{ expires_at?: number }} [tokens] Session-stored token bundle
 * @returns {number} Expiry time in ms since epoch, or `0` if unknown
 */
function tokenExpiresAt(tokens) {
    if (!tokens?.expires_at) {
        return 0;
    }
    return tokens.expires_at;
}

/**
 * Whether the access token should be refreshed before use (missing, expired, or within skew of expiry).
 * @param {{ access_token?: string, expires_at?: number, refresh_token?: string }} [tokens]
 * @param {number} [skewMs] Refresh this many ms before nominal expiry
 * @returns {boolean}
 */
function needsRefresh(tokens, skewMs = 30_000) {
    if (!tokens?.access_token) {
        return true;
    }
    const exp = tokenExpiresAt(tokens);
    return !exp || Date.now() >= exp - skewMs;
}

/**
 * Persist tokens from a token endpoint response into the Express session (`req.session.oidcTokens`).
 * @param {import('express').Request} req
 * @param {object} grant Token endpoint response from `openid-client` (access/refresh/id_token, expiry helpers)
 */
function storeTokensFromGrant(req, grant) {
    const access = grant.access_token;
    const refresh = grant.refresh_token;
    const idTok = grant.id_token;
    let expires_at = 0;
    let ei;
    if (typeof grant.expires_in === "number") {
        ei = grant.expires_in;
    } else if (typeof grant.expiresIn === "function") {
        ei = grant.expiresIn();
    }
    if (typeof ei === "number" && ei > 0) {
        expires_at = Date.now() + ei * 1000;
    } else if (access) {
        try {
            const p = jose.decodeJwt(access);
            if (typeof p.exp === "number") {
                expires_at = p.exp * 1000;
            }
        } catch {
            /* Access token from AS may be opaque; expiry then relies on refresh only */
        }
    }
    req.session.oidcTokens = {
        access_token: access,
        refresh_token: refresh,
        id_token: idTok,
        expires_at,
    };
}

/**
 * Remove OIDC-related keys from the session (tokens and in-flight login state).
 * @param {import('express').Request} req
 */
function clearOidcSession(req) {
    delete req.session.oidc_pkce_verifier;
    delete req.session.oidc_state;
    delete req.session.oidc_return_to;
    delete req.session.oidcTokens;
}

/**
 * Public base URL for redirects (`protocol://host`), honoring `X-Forwarded-Proto` behind a proxy.
 * @param {import('express').Request} req
 * @returns {string}
 */
function publicBaseUrl(req) {
    const proto = req.get("x-forwarded-proto") || req.protocol || "http";
    const host = req.get("host") || `localhost:${req.socket?.localPort || ""}`;
    return `${proto}://${host}`;
}

/**
 * Whether unauthenticated requests should receive `401` instead of a browser redirect to the IdP.
 * Matches `/api`, `/compose`, or `Accept: application/json`.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isApiStyleRequest(req) {
    const p = req.path || "";
    if (p.startsWith("/api") || p.startsWith("/compose")) {
        return true;
    }
    const accept = req.headers.accept || "";
    if (accept.includes("application/json")) {
        return true;
    }
    return false;
}

/**
 * Check that the JWT was issued for this OIDC client (Keycloak uses `azp` and/or `aud`).
 * @param {import('jose').JWTPayload} payload
 * @param {string} clientId OAuth client id (`resource` from adapter config)
 * @returns {boolean}
 */
function tokenMatchesClient(payload, clientId) {
    if (payload.azp === clientId) {
        return true;
    }
    const aud = payload.aud;
    if (Array.isArray(aud)) {
        return aud.includes(clientId) || aud.includes("account");
    }
    return aud === clientId || aud === "account";
}

/**
 * Build OIDC auth for the management controller: discovery, session + bearer tokens,
 * JWT verification (JWKS), refresh, `protect` middleware, and `/auth/callback` + `/logout` routes.
 *
 * @param {object} [options]
 * @param {string} [options.configPath] Override path to `keycloak.json` (default: {@link resolveKeycloakConfigPath})
 * @returns {Promise<{
 *   middleware: import('express').RequestHandler,
 *   protect: (requiredRealmRole?: string) => import('express').RequestHandler,
 *   registerOidcRoutes: (router: import('express').Router) => void,
 *   _issuer: string,
 *   _clientId: string
 * }>}
 * @throws {Error} If adapter config is missing `credentials.secret` or discovery fails
 */
export async function createManagementOidcAuth(options = {}) {
    const configPath = options.configPath ?? resolveKeycloakConfigPath();
    const adapter = loadAdapterConfig(configPath);
    const clientId = adapter.resource;
    const clientSecret = adapter.credentials?.secret;
    if (!clientSecret) {
        throw new Error("keycloak.json must include credentials.secret (confidential client)");
    }

    const issuerHref = realmIssuerHref(adapter);
    const issuerUrl = new URL(issuerHref);

    const configuration = await client.discovery(issuerUrl, clientId, clientSecret);

    const issuerFromAs = normalizeIssuer(configuration.serverMetadata().issuer ?? issuerHref);
    const jwksUrl = new URL(`${issuerFromAs}/protocol/openid-connect/certs`);
    const JWKS = jose.createRemoteJWKSet(jwksUrl);

    /**
     * Verify the access token JWT and ensure it is for this client.
     * @param {string} token Raw JWT
     * @returns {Promise<import('jose').JWTPayload>}
     */
    async function verifyAccessTokenClaims(token) {
        const { payload } = await jose.jwtVerify(token, JWKS, {
            issuer: issuerFromAs,
            algorithms: ["RS256", "RS384", "RS512"],
        });
        if (!tokenMatchesClient(payload, clientId)) {
            throw new Error("Access token not issued for this client");
        }
        return payload;
    }

    /**
     * Load session tokens, refresh if needed, verify access JWT, or clear session on failure.
     * @param {import('express').Request} req
     * @returns {Promise<import('jose').JWTPayload | null>} Verified claims, or `null` if unauthenticated
     */
    async function ensureSessionAccessToken(req) {
        if (!req.session) {
            return null;
        }
        let tokens = req.session.oidcTokens;
        if (!tokens?.refresh_token && !tokens?.access_token) {
            return null;
        }
        if (tokens.refresh_token && needsRefresh(tokens)) {
            try {
                const grant = await client.refreshTokenGrant(configuration, tokens.refresh_token);
                storeTokensFromGrant(req, grant);
                tokens = req.session.oidcTokens;
            } catch (e) {
                Log(`OIDC refresh failed: ${e.message}`);
                clearOidcSession(req);
                return null;
            }
        }
        const access = tokens?.access_token;
        if (!access) {
            return null;
        }
        try {
            return await verifyAccessTokenClaims(access);
        } catch (e) {
            Log(`OIDC access token verification failed: ${e.message}`);
            clearOidcSession(req);
            return null;
        }
    }

    /**
     * Express middleware: prefer `Authorization: Bearer`, else session tokens; sets `req.kauth` when valid.
     * @type {import('express').RequestHandler}
     */
    async function middleware(req, res, next) {
        delete req.kauth;
        try {
            const bearer = readBearer(req);
            if (bearer) {
                try {
                    const payload = await verifyAccessTokenClaims(bearer);
                    attachKauthFromPayload(req, payload);
                } catch (e) {
                    Log(`Bearer token rejected: ${e.message}`);
                }
                return next();
            }

            const payload = await ensureSessionAccessToken(req);
            if (payload) {
                attachKauthFromPayload(req, payload);
            }
            return next();
        } catch (err) {
            return next(err);
        }
    }

    /**
     * Returns middleware that requires a verified access token and optionally a Keycloak realm role
     * (`realm:<name>` maps to `realm_access.roles` includes `<name>`).
     *
     * @param {string} [requiredRealmRole] e.g. `realm:van-owner`; omit for any authenticated user
     * @returns {import('express').RequestHandler}
     */
    function protect(requiredRealmRole) {
        /** @type {import('express').RequestHandler} */
        return async function protectMiddleware(req, res, next) {
            try {
                if (!req.kauth?.grant?.access_token?.content) {
                    return await rejectUnauthenticated(req, res);
                }
                const content = req.kauth.grant.access_token.content;
                if (requiredRealmRole) {
                    const roleName = requiredRealmRole.replace(/^realm:/, "");
                    const roles = content.realm_access?.roles;
                    if (!Array.isArray(roles) || !roles.includes(roleName)) {
                        return res.status(403).send("Forbidden");
                    }
                }
                return next();
            } catch (e) {
                return next(e);
            }
        };
    }

    /**
     * Respond with `401` for API-style requests or redirect browser navigations to the IdP login URL.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {Promise<void | import('express').Response>}
     */
    async function rejectUnauthenticated(req, res) {
        if (isApiStyleRequest(req)) {
            return res.status(401).send("Unauthorized");
        }
        try {
            await startLoginRedirect(req, res);
        } catch (e) {
            Log(`OIDC login redirect failed: ${e.message}`);
            return res.status(500).send("Authentication setup failed");
        }
    }

    /**
     * Start the authorization code flow: PKCE + state in session, redirect to Keycloak.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async function startLoginRedirect(req, res) {
        const code_verifier = client.randomPKCECodeVerifier();
        const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
        const state = client.randomState();
        req.session.oidc_pkce_verifier = code_verifier;
        req.session.oidc_state = state;
        req.session.oidc_return_to = req.originalUrl || "/";
        
        const redirect_uri = `${publicBaseUrl(req)}${OIDC_REDIRECT_PATH}`;
        const parameters = {
            redirect_uri,
            scope: "openid profile email",
            code_challenge,
            code_challenge_method: "S256",
            state,
        };
        const redirectTo = client.buildAuthorizationUrl(configuration, parameters);
        res.redirect(redirectTo.href);
    }

    /**
     * OAuth redirect handler: exchange `code` for tokens, store in session, redirect to `oidc_return_to`.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async function authCallback(req, res, next) {
        try {
            const returnTo = req.session?.oidc_return_to || "/";
            const verifier = req.session?.oidc_pkce_verifier;
            const st = req.session?.oidc_state;
            if (!verifier || !st) {
                return res.status(400).send("Missing OIDC session (PKCE/state); retry login");
            }
            const currentUrl = new URL(`${publicBaseUrl(req)}${req.originalUrl}`);
            const grant = await client.authorizationCodeGrant(configuration, currentUrl, {
                pkceCodeVerifier: verifier,
                expectedState: st,
            });
            delete req.session.oidc_pkce_verifier;
            delete req.session.oidc_state;
            delete req.session.oidc_return_to;
            storeTokensFromGrant(req, grant);
            res.redirect(returnTo);
        } catch (e) {
            Log(`OIDC callback error: ${e.stack || e.message}`);
            return next(e);
        }
    }

    /**
     * Destroy the session and redirect to Keycloak end-session (RP-initiated logout).
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    function logout(req, res) {
        const idToken = req.session?.oidcTokens?.id_token;
        const returnBase = `${publicBaseUrl(req)}/`;
        req.session.destroy((err) => {
            if (err) {
                Log(`Session destroy on logout: ${err.message}`);
            }
            try {
                const params = { post_logout_redirect_uri: returnBase };
                if (idToken) {
                    params.id_token_hint = idToken;
                }
                const url = client.buildEndSessionUrl(configuration, params);
                res.redirect(url.href);
            } catch (e) {
                Log(`buildEndSessionUrl failed: ${e.message}`);
                res.redirect(returnBase);
            }
        });
    }

    /**
     * Register `GET /auth/callback` and `GET /logout` on the given router (before auth middleware).
     * @param {import('express').Router} router
     */
    function registerOidcRoutes(router) {
        router.get(OIDC_REDIRECT_PATH, authCallback);
        router.get("/logout", logout);
    }

    return {
        middleware,
        protect,
        registerOidcRoutes,
        /** For tests / introspection */
        _issuer: issuerFromAs,
        _clientId: clientId,
    };
}
