/*
 * cert-manager bootstrap — root CA certificate and vms-root issuer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ROOT_CA_CERT, ROOT_ISSUER } from '../config.js';
import { requireCluster, kubectl, kubectlWait } from '../../helpers/kubectl.js';

describe('cert-manager bootstrap', () => {
    beforeAll(() => {
        requireCluster();
    });

    it('cert-manager deployments are available', () => {
        for (const dep of ['cert-manager', 'cert-manager-webhook', 'cert-manager-cainjector']) {
            const { stdout } = kubectl(
                [
                    'get',
                    'deployment',
                    dep,
                    '-o',
                    'jsonpath={.status.availableReplicas}',
                ],
                { namespace: 'cert-manager' },
            );
            expect(Number(stdout)).toBeGreaterThanOrEqual(1);
        }
    });

    it('vms-root-ca certificate becomes Ready', () => {
        kubectlWait('certificate', ROOT_CA_CERT, 'Ready', 300);
        const { stdout } = kubectl([
            'get',
            'certificate',
            ROOT_CA_CERT,
            '-o',
            'jsonpath={.status.conditions[?(@.type=="Ready")].status}',
        ]);
        expect(stdout).toBe('True');
    });

    it('vms-root issuer exists', () => {
        const { stdout } = kubectl(['get', 'issuer', ROOT_ISSUER, '-o', 'name']);
        expect(stdout).toBe(`issuer.cert-manager.io/${ROOT_ISSUER}`);
    });

    it('vms-root-secret contains a CA certificate', () => {
        const { stdout } = kubectl([
            'get',
            'secret',
            'vms-root-secret',
            '-o',
            String.raw`jsonpath={.data.ca\.crt}`,
        ]);
        expect(stdout.length).toBeGreaterThan(0);
        const pem = Buffer.from(stdout, 'base64').toString('utf8');
        expect(pem).toContain('BEGIN CERTIFICATE');
    });

    it('selfsigned-issuer exists', () => {
        const { stdout } = kubectl(['get', 'issuer', 'selfsigned-issuer', '-o', 'name']);
        expect(stdout).toBe('issuer.cert-manager.io/selfsigned-issuer');
    });
});
