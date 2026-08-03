/*
 * Bootstrap YAML generation and backbone site helpers for integration tests.
 */

import * as common from "../../../modules/src/common.js";
import { ToYaml } from "../../../modules/src/util.js";
import * as resourceTemplates from "../../../components/management-controller/src/resource-templates.js";
import {
    MC_DEPLOYMENT,
    ROUTER_LABEL_SELECTOR,
    SC_IMAGE,
    NAMESPACE,
    SITE_CONTROLLER_DEPLOYMENT,
    SITE_NAMESPACE,
    TEST_MANAGE_AP_ID,
    TEST_MANAGE_AP_TLS_SECRET,
    TEST_SITE_CERT_SECRET,
    TEST_SITE_ID,
    TEST_SITE_NAME,
} from "../kind/config.js";
import { kubectl, getPodLogs } from "./kubectl.js";
import { psql } from "./postgres.js";

/**
 * @param {string} name
 * @param {string} [namespace]
 * @returns {{ data: Record<string, string> }}
 */
function readSecretData(name, namespace = NAMESPACE) {
    const { stdout } = kubectl(["get", "secret", name, "-o", "json"], {
        namespace,
    });
    const secret = JSON.parse(stdout);
    return { data: secret.data };
}

/**
 * Build bootstrap YAML for initial site bring-up.
 * Includes manage AP TLS secret (named vms-access-{apId}) and RouterAccess once seed has issued the cert.
 * @param {string} [siteId]
 * @returns {string}
 */
export function generateBootstrapYaml(siteId = TEST_SITE_ID) {
    const siteSecret = readSecretData(TEST_SITE_CERT_SECRET);
    const manageApSecret = readSecretData(TEST_MANAGE_AP_TLS_SECRET);

    return ToYaml([
        resourceTemplates.ServiceAccount(),
        resourceTemplates.BackboneRole(),
        resourceTemplates.RoleBinding(),
        resourceTemplates.Deployment(siteId, true, "sk2", SC_IMAGE),
        resourceTemplates.Secret(
            siteSecret,
            `vms-site-${siteId}`,
            common.INJECT_TYPE_SITE,
            `tls-site-${siteId}`
        ),
        resourceTemplates.Secret(
            manageApSecret,
            TEST_MANAGE_AP_TLS_SECRET,
            common.INJECT_TYPE_ACCESS_POINT,
            `tls-server-${TEST_MANAGE_AP_ID}`
        ),
        resourceTemplates.AccessPointCR(TEST_MANAGE_AP_ID, {
            kind: "manage",
            accessType: "local",
        }),
        // Network must exist before Site (multi-van).
        resourceTemplates.NetworkCR("mbone"),
        resourceTemplates.BackboneSite(TEST_SITE_NAME, siteId),
    ]);
}

/**
 * @param {string} [namespace]
 * @returns {boolean}
 */
function siteControllerDeployed(namespace = SITE_NAMESPACE) {
    const { status } = kubectl(["get", "deployment", SITE_CONTROLLER_DEPLOYMENT, "-o", "name"], {
        namespace,
        allowFailure: true,
    });
    return status === 0;
}

/**
 * @param {string} [namespace]
 * @returns {boolean}
 */
function skupperRouterRunning(namespace = SITE_NAMESPACE) {
    const { stdout, status } = kubectl(
        ["get", "pods", "-l", ROUTER_LABEL_SELECTOR, "-o", "jsonpath={.items[0].status.phase}"],
        { namespace, allowFailure: true }
    );
    return status === 0 && stdout === "Running";
}

/**
 * Whether bootstrap YAML should be applied (cluster-first, not only DB ready-bootstrap).
 * @param {string} [siteId]
 * @param {string} [namespace]
 * @returns {boolean}
 */
export function needsBackboneBootstrap(siteId = TEST_SITE_ID, namespace = SITE_NAMESPACE) {
    const state = interiorSiteDeploymentState(siteId);

    if (!siteControllerDeployed(namespace)) {
        return true;
    }

    if (state === "deployed") {
        return false;
    }

    return !skupperRouterRunning(namespace);
}

/**
 * Remove Skupper/site-controller resources before a fresh bootstrap apply.
 * @param {string} [namespace]
 */
export function cleanupBackboneSiteResources(namespace = SITE_NAMESPACE) {
    kubectl(
        [
            "delete",
            "deployment",
            "skupper-router",
            SITE_CONTROLLER_DEPLOYMENT,
            "--ignore-not-found=true",
        ],
        { namespace, allowFailure: true }
    );
    kubectl(["delete", "routeraccess", "--all", "--ignore-not-found=true"], {
        namespace,
        allowFailure: true,
    });
    kubectl(["delete", "site,network", "--all", "--ignore-not-found=true"], {
        namespace,
        allowFailure: true,
    });
}

/**
 * @param {string} yamlText
 * @param {string} [namespace]
 */
export function kubectlApplyYaml(yamlText, namespace = SITE_NAMESPACE) {
    kubectl(["apply", "-f", "-"], { namespace, input: yamlText });
}

/**
 * @param {string} siteId
 * @returns {string}
 */
function interiorSiteDeploymentState(siteId) {
    const escaped = siteId.replace(/'/g, "''");
    return psql(`SELECT deploymentstate FROM interiorsites WHERE id = '${escaped}';`).trim();
}

/**
 * @param {string} apId
 * @returns {{ hostname: string | null, port: string | null, lifecycle: string | null }}
 */
export function accessPointRow(apId) {
    const escaped = apId.replace(/'/g, "''");
    const out = psql(
        `SELECT hostname, port, lifecycle FROM backboneaccesspoints WHERE id = '${escaped}';`
    ).trim();
    if (!out) {
        return { hostname: null, port: null, lifecycle: null };
    }
    const [hostname, port, lifecycle] = out.split("|");
    return {
        hostname: hostname || null,
        port: port || null,
        lifecycle: lifecycle || null,
    };
}

/**
 * Poll pod logs until all startup markers appear or timeout.
 * @param {string} labelSelector
 * @param {string[]} markers
 * @param {string} [namespace]
 * @param {number} [timeoutMs]
 * @param {RegExp} [failurePattern]
 * @returns {Promise<string>}
 */
export async function waitForPodLogMarkers(
    labelSelector,
    markers,
    namespace = SITE_NAMESPACE,
    timeoutMs = 300_000,
    failurePattern = /initialization failed/i
) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const logs = getPodLogs(labelSelector, namespace);
        if (failurePattern.test(logs)) {
            throw new Error(`Pod startup failed (${labelSelector}): matched ${failurePattern}`);
        }
        if (markers.every((marker) => logs.includes(marker))) {
            return logs;
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error(`Timed out waiting for log markers on ${labelSelector}: ${markers.join(", ")}`);
}

/**
 * Poll MC logs until pattern matches or timeout.
 * @param {RegExp} pattern
 * @param {number} [timeoutMs]
 */
export async function waitForMcLog(pattern, timeoutMs = 300_000) {
    const selector = `app.kubernetes.io/instance=${MC_DEPLOYMENT}`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const logs = getPodLogs(selector);
        if (pattern.test(logs)) {
            return logs;
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`Timed out waiting for MC log matching ${pattern}`);
}

/**
 * @param {string} name Secret metadata.name (exact match).
 * @param {string} [namespace]
 * @returns {boolean}
 */
export function secretExists(name, namespace = SITE_NAMESPACE) {
    const { status } = kubectl(["get", "secret", name, "-o", "name"], {
        namespace,
        allowFailure: true,
    });
    return status === 0;
}

/**
 * @param {string} name
 * @param {string} [namespace]
 * @returns {boolean}
 */
export function secretHasTlsCert(name, namespace = SITE_NAMESPACE) {
    const { stdout, status } = kubectl(
        ["get", "secret", name, "-o", String.raw`jsonpath={.data.tls\.crt}`],
        { namespace, allowFailure: true }
    );
    return status === 0 && stdout.length > 0;
}

/**
 * Poll until a Secret exists or timeout.
 * @param {string} name
 * @param {string} [namespace]
 * @param {number} [timeoutMs]
 */
export async function waitForSecret(name, namespace = SITE_NAMESPACE, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (secretExists(name, namespace)) {
            return;
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`Timed out waiting for secret ${name} in ${namespace}`);
}

/**
 * Poll until a backbone access point row matches expected fields.
 * @param {string} apId
 * @param {{ hostname?: string, port?: string, lifecycle?: string }} [expected]
 * @param {number} [timeoutMs]
 */
export async function waitForAccessPointRow(apId, expected = {}, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    let last = accessPointRow(apId);
    while (Date.now() < deadline) {
        last = accessPointRow(apId);
        const hostnameOk = expected.hostname === undefined || last.hostname === expected.hostname;
        const portOk = expected.port === undefined || last.port === expected.port;
        const lifecycleOk =
            expected.lifecycle === undefined || last.lifecycle === expected.lifecycle;
        if (last.hostname && last.port && hostnameOk && portOk && lifecycleOk) {
            return last;
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(
        `Timed out waiting for access point ${apId}. Last: ${JSON.stringify(last)}; expected: ${JSON.stringify(expected)}`
    );
}
