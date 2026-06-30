/*
 * HTTP client for site-controller API via kubectl port-forward to the site pod.
 */

import { SITE_LOCAL_PORT, SITE_NAMESPACE } from '../kind/config.js';
import { getPodName, startPodPortForward, waitForHttp } from './kubectl.js';

const PROBE_TIMEOUT_MS = 5_000;
const SITE_API_PORT = 1040;

/**
 * @param {string} labelSelector
 * @param {number} [localPort]
 * @returns {Promise<{ localPort: number, stop: () => void }>}
 */
export async function startSitePortForward(labelSelector, localPort = SITE_LOCAL_PORT) {
    const podName = getPodName(labelSelector, SITE_NAMESPACE);
    const { child } = await startPodPortForward(localPort, podName, SITE_API_PORT, SITE_NAMESPACE);

    const stop = () => {
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    };

    await waitForHttp(async () => {
        const res = await fetch(`http://127.0.0.1:${localPort}/healthz`, {
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (res.ok) {
            return res;
        }
        throw new Error(`Unexpected healthz status ${res.status}`);
    });

    return { localPort, stop };
}

/**
 * @param {number} localPort
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function siteFetch(localPort, path, init = {}) {
    return fetch(`http://127.0.0.1:${localPort}${path}`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        ...init,
    });
}

/**
 * Poll hostnames API until the given access point has host and port.
 * @param {number} localPort
 * @param {string} apId
 * @param {number} [timeoutMs]
 * @returns {Promise<{ body: Record<string, { host: string, port: number | string }>, entry: { host: string, port: number | string } }>}
 */
export async function waitForHostnamesEntry(localPort, apId, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    let lastBody = {};
    while (Date.now() < deadline) {
        const res = await siteFetch(localPort, '/api/v1alpha1/hostnames', {
            headers: { Accept: 'application/json' },
        });
        if (res.status === 200) {
            lastBody = await res.json();
            const entry = lastBody[apId];
            if (entry?.host && entry?.port) {
                return { body: lastBody, entry };
            }
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(
        `Timed out waiting for hostnames entry ${apId}. Last body: ${JSON.stringify(lastBody)}`,
    );
}
