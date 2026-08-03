/*
 * HTTP client for management-controller via kubectl port-forward.
 */

import { MC_LOCAL_PORT, MC_PORT, MC_SERVICE } from "../kind/config.js";
import { startPortForward, waitForHttp } from "./kubectl.js";

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Start port-forward to the management-server Service.
 * @param {number} [localPort]
 * @returns {Promise<{ localPort: number, stop: () => void }>}
 */
export async function startMcPortForward(localPort = MC_LOCAL_PORT) {
    const { child } = await startPortForward(localPort, MC_SERVICE, MC_PORT, { timeoutMs: 60_000 });

    const stop = () => {
        if (!child.killed) {
            child.kill("SIGTERM");
        }
    };

    await waitForHttp(async () => {
        const res = await fetch(`http://127.0.0.1:${localPort}/api/v1alpha1/`, {
            redirect: "manual",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        // API-style unauthenticated request should get 401, not an OIDC redirect.
        if (res.status === 401 || (res.status >= 200 && res.status < 500)) {
            return res;
        }
        throw new Error(`Unexpected status ${res.status}`);
    });

    return { localPort, stop };
}

/**
 * @param {number} localPort
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function mcFetch(localPort, path, init = {}) {
    return fetch(`http://127.0.0.1:${localPort}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        ...init,
    });
}
