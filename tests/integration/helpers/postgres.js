/*
 * PostgreSQL assertions via kubectl exec into the Bitnami primary pod.
 */

import {
    POSTGRES_ADMIN_PASSWORD_KEY,
    POSTGRES_DB,
    POSTGRES_RELEASE,
    POSTGRES_SECRET,
    POSTGRES_USER,
    TEST_SITE_ID,
} from '../kind/config.js';
import { kubectl, kubectlExec, getPodName } from './kubectl.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = { postgresPassword: /** @type {string | undefined} */ (undefined) };

/**
 * Superuser password from the postgres-credentials Secret (matches cluster-up.sh).
 * @returns {string}
 */
export function getPostgresPassword() {
    if (!cache.postgresPassword) {
        const { stdout } = kubectl([
            'get',
            'secret',
            POSTGRES_SECRET,
            '-o',
            `jsonpath={.data.${POSTGRES_ADMIN_PASSWORD_KEY}}`,
        ]);
        cache.postgresPassword = Buffer.from(stdout, 'base64').toString('utf8');
    }
    return cache.postgresPassword;
}

/** Escape a string for use inside single-quoted bash argument. */
function shellSingleQuote(value) {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * Run psql as the postgres superuser inside the primary pod.
 * @param {string} sql
 * @returns {string}
 */
export function psql(sql) {
    const pod = postgresPodName();
    const escaped = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const cmd = [
        `PGPASSWORD=${shellSingleQuote(getPostgresPassword())}`,
        'psql',
        '-h',
        '127.0.0.1',
        '-U',
        POSTGRES_USER,
        '-d',
        POSTGRES_DB,
        '-tAc',
        `"${escaped}"`,
    ].join(' ');
    return kubectlExec(pod, ['bash', '-lc', cmd]);
}

/**
 * @returns {string}
 */
export function postgresPodName() {
    return getPodName(`app.kubernetes.io/instance=${POSTGRES_RELEASE}`);
}

/**
 * @param {string} table PascalCase name from db-setup.sql (stored lowercase in PostgreSQL).
 * @returns {boolean}
 */
export function tableExists(table) {
    const safe = table.replace(/'/g, "''");
    const out = psql(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = lower('${safe}'));`,
    );
    return out.trim() === 't';
}

/**
 * @returns {number}
 */
export function configurationRowCount() {
    const out = psql('SELECT COUNT(*) FROM configuration WHERE id = 0;');
    return Number(out.trim());
}

/**
 * @param {string} controllerName
 * @returns {number}
 */
export function managementControllerCount(controllerName) {
    const escaped = controllerName.replace(/'/g, "''");
    const out = psql(
        `SELECT COUNT(*) FROM managementcontrollers WHERE name = '${escaped}';`,
    );
    return Number(out.trim());
}

/**
 * @param {string} siteId
 * @returns {number}
 */
export function interiorSiteCount(siteId) {
    const escaped = siteId.replace(/'/g, "''");
    const out = psql(`SELECT COUNT(*) FROM interiorsites WHERE id = '${escaped}';`);
    return Number(out.trim());
}

/**
 * Re-run seed-integration.sh when cluster-up seed failed or was skipped.
 * @param {string} [siteId]
 */
export function ensureBackboneSiteSeeded(siteId = TEST_SITE_ID) {
    if (interiorSiteCount(siteId) >= 1) {
        return;
    }
    const script = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../kind/scripts/seed-integration.sh',
    );
    const result = spawnSync(script, {
        stdio: 'inherit',
        env: process.env,
    });
    if (result.status !== 0) {
        throw new Error(`seed-integration.sh failed (exit ${result.status})`);
    }
    if (interiorSiteCount(siteId) < 1) {
        throw new Error(`InteriorSites row ${siteId} still missing after seed-integration.sh`);
    }
}
