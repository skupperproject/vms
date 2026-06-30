/*
 * management stack health — Postgres, MC pod, HTTP, startup logs, DB row.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    MC_DEPLOYMENT,
    MC_STARTUP_LOG_MARKERS,
    EXPECTED_TABLES,
} from '../config.js';
import { requireCluster, kubectl, waitDeploymentReady, getPodLogs } from '../../helpers/kubectl.js';
import {
    tableExists,
    configurationRowCount,
    managementControllerCount,
} from '../../helpers/postgres.js';
import { startMcPortForward, mcFetch } from '../../helpers/api-client.js';

describe('management stack health', () => {
    beforeAll(() => {
        requireCluster();
        waitDeploymentReady(MC_DEPLOYMENT);
    }, 600_000);

    it('Postgres schema tables exist', () => {
        for (const table of EXPECTED_TABLES) {
            expect(tableExists(table), `missing table ${table}`).toBe(true);
        }
    });

    it('Configuration seed row is present', () => {
        expect(configurationRowCount()).toBeGreaterThan(0);
    });

    it('management-server deployment is available', () => {
        const { stdout } = kubectl([
            'get',
            'deployment',
            MC_DEPLOYMENT,
            '-o',
            'jsonpath={.status.availableReplicas}',
        ]);
        expect(Number(stdout)).toBeGreaterThanOrEqual(1);
    });

    it('management-server pod is running and ready', () => {
        const selector = `app.kubernetes.io/instance=${MC_DEPLOYMENT}`;

        const { stdout: phase } = kubectl([
            'get',
            'pods',
            '-l',
            selector,
            '-o',
            'jsonpath={.items[0].status.phase}',
        ]);
        expect(phase).toBe('Running');

        const { stdout: ready } = kubectl([
            'get',
            'pods',
            '-l',
            selector,
            '-o',
            'jsonpath={.items[0].status.conditions[?(@.type=="Ready")].status}',
        ]);
        expect(ready).toBe('True');

        const { stdout: waitingReason, status } = kubectl(
            [
                'get',
                'pods',
                '-l',
                selector,
                '-o',
                'jsonpath={.items[0].status.containerStatuses[0].state.waiting.reason}',
            ],
            { allowFailure: true },
        );
        if (status === 0 && waitingReason) {
            expect(['CrashLoopBackOff', 'Error', 'ImagePullBackOff']).not.toContain(waitingReason);
        }
    });

    it('management-controller startup log markers are present', () => {
        const logs = getPodLogs(`app.kubernetes.io/instance=${MC_DEPLOYMENT}`);
        for (const marker of MC_STARTUP_LOG_MARKERS) {
            expect(logs).toContain(marker);
        }
        expect(logs).not.toMatch(/Management controller initialization failed/i);
    });

    it('ManagementControllers row created on startup', () => {
        const { stdout: podName } = kubectl([
            'get',
            'pods',
            '-l',
            `app.kubernetes.io/instance=${MC_DEPLOYMENT}`,
            '-o',
            'jsonpath={.items[0].metadata.name}',
        ]);
        expect(managementControllerCount(podName)).toBeGreaterThanOrEqual(1);
    });

    describe('HTTP via port-forward', () => {
        /** @type {{ localPort: number, stop: () => void } | undefined} */
        let portForward;

        beforeAll(async () => {
            portForward = await startMcPortForward();
        }, 120_000);

        afterAll(() => {
            portForward?.stop();
        });

        it('endpoint responds with 401 when unauthenticated', async () => {
            const res = await mcFetch(portForward.localPort, '/api/v1alpha1/', {
                headers: { Accept: 'application/json' },
            });
            expect(res.status).toBe(401);
            expect(res.headers.get('location')).toBeNull();
        });
    });
});
