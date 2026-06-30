/*
 * Keycloak token helper for integration tests (password grant via port-forward).
 */

import {
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_LOCAL_PORT,
    KEYCLOAK_PORT,
    KEYCLOAK_REALM,
    KEYCLOAK_SERVICE,
    KEYCLOAK_ADMIN_USER,
    KEYCLOAK_ADMIN_PASSWORD,
    KEYCLOAK_VIEWER_USER,
    KEYCLOAK_VIEWER_PASSWORD,
} from '../kind/config.js';
import { startPortForward, waitForHttp } from './kubectl.js';

const TOKEN_TIMEOUT_MS = 15_000;

/**
 * Start port-forward to the in-cluster Keycloak Service.
 * @param {number} [localPort]
 * @returns {Promise<{ localPort: number, stop: () => void }>}
 */
export async function startKeycloakPortForward(localPort = KEYCLOAK_LOCAL_PORT) {
    const { child } = await startPortForward(localPort, KEYCLOAK_SERVICE, KEYCLOAK_PORT, {
        timeoutMs: 120_000,
    });

    const stop = () => {
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    };

    await waitForHttp(async () => {
        const res = await fetch(
            `http://127.0.0.1:${localPort}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
            { signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) },
        );
        if (!res.ok) {
            throw new Error(`Keycloak discovery returned ${res.status}`);
        }
        return res;
    });

    return { localPort, stop };
}

/**
 * Obtain an access token using the resource-owner password grant.
 * @param {number} localPort Port-forward local port
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} access_token JWT
 */
export async function fetchAccessToken(localPort, username, password) {
    const params = new URLSearchParams({
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        username,
        password,
    });

    const res = await fetch(
        `http://127.0.0.1:${localPort}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
            signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        },
    );

    const body = await res.text();
    if (!res.ok) {
        throw new Error(`Keycloak token request failed (${res.status}): ${body}`);
    }

    const json = JSON.parse(body);
    if (!json.access_token) {
        throw new Error(`Keycloak token response missing access_token: ${body}`);
    }
    return json.access_token;
}

/** @param {number} localPort */
export function fetchAdminAccessToken(localPort) {
    return fetchAccessToken(localPort, KEYCLOAK_ADMIN_USER, KEYCLOAK_ADMIN_PASSWORD);
}

/** @param {number} localPort */
export function fetchViewerAccessToken(localPort) {
    return fetchAccessToken(localPort, KEYCLOAK_VIEWER_USER, KEYCLOAK_VIEWER_PASSWORD);
}

/**
 * @param {string} accessToken
 * @returns {{ Authorization: string }}
 */
export function bearerAuth(accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
}
