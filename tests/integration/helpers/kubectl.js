/*
 * kubectl / helmfile helpers for integration tests.
 */

import { spawnSync, spawn } from 'node:child_process';
import { CLUSTER_NAME, KUBECTL_CONTEXT, NAMESPACE } from '../kind/config.js';

/**
 * @param {string[]} args
 * @param {{ namespace?: string, context?: string, input?: string, allowFailure?: boolean }} [opts]
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
export function kubectl(args, opts = {}) {
    const fullArgs = [];
    const ctx = opts.context ?? KUBECTL_CONTEXT;
    if (ctx) {
        fullArgs.push('--context', ctx);
    }
    if (opts.namespace ?? NAMESPACE) {
        fullArgs.push('-n', opts.namespace ?? NAMESPACE);
    }
    fullArgs.push(...args);

    const result = spawnSync('kubectl', fullArgs, {
        encoding: 'utf8',
        input: opts.input,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0 && !opts.allowFailure) {
        const err = new Error(
            `kubectl ${fullArgs.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
        );
        err.result = result;
        throw err;
    }

    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        status: result.status,
    };
}

/**
 * @param {string} resource
 * @param {string} name
 * @param {string} condition
 * @param {number} timeoutSec
 */
export function kubectlWait(resource, name, condition, timeoutSec = 300) {
    kubectl([
        'wait',
        `--for=condition=${condition}`,
        `${resource}/${name}`,
        `--timeout=${timeoutSec}s`,
    ]);
}

/**
 * @param {string} selector
 * @param {number} timeoutSec
 */
export function waitDeploymentReady(name, timeoutSec = 300) {
    kubectlWait('deployment', name, 'Available', timeoutSec);
}

/**
 * @returns {string} First Running pod name for label selector.
 * @param {string} labelSelector
 * @param {string} [namespace]
 */
export function getPodName(labelSelector, namespace) {
    const { stdout } = kubectl(
        [
            'get',
            'pods',
            '-l',
            labelSelector,
            '-o',
            'jsonpath={.items[0].metadata.name}',
        ],
        { namespace },
    );
    if (!stdout) {
        throw new Error(`No pod found for selector ${labelSelector}`);
    }
    return stdout;
}

/**
 * @param {string} podName
 * @param {string[]} containerArgs
 * @param {{ namespace?: string }} [opts]
 */
export function kubectlExec(podName, containerArgs, opts = {}) {
    const { stdout } = kubectl(['exec', podName, '--', ...containerArgs], opts);
    return stdout;
}

/**
 * @param {string} labelSelector
 * @param {string} [namespace]
 * @returns {string}
 */
export function getPodLogs(labelSelector, namespace) {
    const pod = getPodName(labelSelector, namespace);
    const { stdout } = kubectl(['logs', pod], { namespace });
    return stdout;
}

/**
 * @param {number} localPort
 * @param {string} serviceName
 * @param {number} remotePort
 * @param {{ namespace?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ child: import('node:child_process').ChildProcess, localPort: number }>}
 */
export function startPortForward(localPort, serviceName, remotePort, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const ns = opts.namespace ?? NAMESPACE;
    return new Promise((resolve, reject) => {
        const child = spawn(
            'kubectl',
            [
                '--context',
                KUBECTL_CONTEXT,
                '-n',
                ns,
                'port-forward',
                '--address',
                '127.0.0.1',
                `svc/${serviceName}`,
                `${localPort}:${remotePort}`,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );

        let settled = false;
        const fail = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (!child.killed) {
                child.kill('SIGTERM');
            }
            reject(err);
        };

        const timer = setTimeout(
            () => fail(new Error(`port-forward to ${serviceName} did not become ready within ${timeoutMs}ms`)),
            timeoutMs,
        );

        const onOutput = (chunk) => {
            const text = chunk.toString();
            if (text.includes('Forwarding from') || text.includes('Handling connection for')) {
                clearTimeout(timer);
                settled = true;
                resolve({ child, localPort });
            }
            if (text.includes('unable to forward') || text.includes('error forwarding port')) {
                fail(new Error(text.trim()));
            }
        };

        child.stdout.on('data', onOutput);
        child.stderr.on('data', onOutput);
        child.on('error', fail);
        child.on('exit', (code, signal) => {
            if (!settled) {
                fail(new Error(`port-forward exited (code=${code}, signal=${signal})`));
            }
        });
    });
}

/**
 * Port-forward to a pod (site-controller has no Service).
 * @param {number} localPort
 * @param {string} podName
 * @param {number} remotePort
 * @param {string} [namespace]
 * @param {number} [timeoutMs]
 */
export function startPodPortForward(localPort, podName, remotePort, namespace, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            'kubectl',
            [
                '--context',
                KUBECTL_CONTEXT,
                '-n',
                namespace ?? NAMESPACE,
                'port-forward',
                '--address',
                '127.0.0.1',
                `pod/${podName}`,
                `${localPort}:${remotePort}`,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );

        let settled = false;
        const fail = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (!child.killed) {
                child.kill('SIGTERM');
            }
            reject(err);
        };

        const timer = setTimeout(
            () => fail(new Error(`port-forward to pod/${podName} did not become ready within ${timeoutMs}ms`)),
            timeoutMs,
        );

        const onOutput = (chunk) => {
            const text = chunk.toString();
            if (text.includes('Forwarding from') || text.includes('Handling connection for')) {
                clearTimeout(timer);
                settled = true;
                resolve({ child, localPort });
            }
            if (text.includes('unable to forward') || text.includes('error forwarding port')) {
                fail(new Error(text.trim()));
            }
        };

        child.stdout.on('data', onOutput);
        child.stderr.on('data', onOutput);
        child.on('error', fail);
        child.on('exit', (code, signal) => {
            if (!settled) {
                fail(new Error(`port-forward exited (code=${code}, signal=${signal})`));
            }
        });
    });
}

/** @param {unknown} err */
function isRetryableHttpError(err) {
    const codes = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_SOCKET']);
    /** @param {unknown} e */
    const codeOf = (e) => (e && typeof e === 'object' && 'code' in e ? e.code : undefined);
    if (codes.has(codeOf(err))) {
        return true;
    }
    if (codes.has(codeOf(err?.cause))) {
        return true;
    }
    const msg = String(err?.message ?? err);
    return msg.includes('fetch failed') || msg.includes('ECONNRESET');
}

/**
 * Poll until port-forward target responds or timeout.
 * @param {() => Promise<Response>} probe
 * @param {number} timeoutMs
 */
export async function waitForHttp(probe, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const res = await probe();
            return res;
        } catch (e) {
            lastError = e;
            if (!isRetryableHttpError(e)) {
                throw e;
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    throw lastError ?? new Error('HTTP probe timed out');
}

/** @returns {boolean} */
export function clusterExists() {
    const result = spawnSync('kind', ['get', 'clusters'], { encoding: 'utf8' });
    if (result.status !== 0) {
        return false;
    }
    return (result.stdout || '').split(/\s+/).includes(CLUSTER_NAME);
}

/** Fail fast when integration tests run without a cluster. */
export function requireCluster() {
    if (!clusterExists()) {
        throw new Error(
            `Kind cluster "${CLUSTER_NAME}" not found. Run: pnpm run test:integration:local`,
        );
    }
}
