/*
 * backbone site bootstrap — SQL seed, bootstrap YAML, site-controller, AMQP/state-sync smoke.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  TEST_MANAGE_AP_ID,
  TEST_MANAGE_AP_TLS_SECRET,
  TEST_MANAGE_AP_HOSTNAME,
  TEST_MANAGE_AP_PORT,
  TEST_SITE_ID,
  SITE_NAMESPACE,
  SITE_CONTROLLER_DEPLOYMENT,
  SITE_CONTROLLER_LABEL,
  ROUTER_LABEL_SELECTOR,
  SC_STARTUP_LOG_MARKERS,
} from "../config.js"
import {
  requireCluster,
  kubectl,
  waitForRunningPod,
  createNamespace,
} from "../../helpers/kubectl.js"
import { psql, ensureBackboneSiteSeeded } from "../../helpers/postgres.js"
import {
  generateBootstrapYaml,
  kubectlApplyYaml,
  needsBackboneBootstrap,
  cleanupBackboneSiteResources,
  waitForPodLogMarkers,
  waitForMcLog,
  secretExists,
  secretHasTlsCert,
  waitForSecret,
  waitForAccessPointRow,
} from "../../helpers/bootstrap.js"
import {
  startSitePortForward,
  waitForHostnamesEntry,
} from "../../helpers/site-api-client.js"

describe("backbone site bootstrap", () => {
  beforeAll(async () => {
    requireCluster()
    ensureBackboneSiteSeeded(TEST_SITE_ID)
    createNamespace(SITE_NAMESPACE)

    if (needsBackboneBootstrap(TEST_SITE_ID, SITE_NAMESPACE)) {
      cleanupBackboneSiteResources(SITE_NAMESPACE)
      kubectlApplyYaml(generateBootstrapYaml())
    }

    await waitForRunningPod(SITE_CONTROLLER_LABEL, SITE_NAMESPACE)
    await waitForRunningPod(ROUTER_LABEL_SELECTOR, SITE_NAMESPACE)

    // If the site connected before the manage AP was seeded ready, restart to pull tls-server-*.
    if (!secretExists(TEST_MANAGE_AP_TLS_SECRET)) {
      kubectl(
        ["rollout", "restart", "deployment", SITE_CONTROLLER_DEPLOYMENT],
        {
          namespace: SITE_NAMESPACE,
        },
      )
      await waitForRunningPod(SITE_CONTROLLER_LABEL, SITE_NAMESPACE)
    }

    await waitForPodLogMarkers(
      SITE_CONTROLLER_LABEL,
      SC_STARTUP_LOG_MARKERS,
      SITE_NAMESPACE,
    )
  }, 600_000)

  it("Postgres has backbone site seeded and bootstrapped", () => {
    const escaped = TEST_SITE_ID.replace(/'/g, "''")
    const state = psql(
      `SELECT deploymentstate FROM interiorsites WHERE id = '${escaped}' AND lifecycle = 'ready';`,
    ).trim()
    expect(state).toMatch(
      /^ready-boot|^deployed$|^colo-automatic$|^ready-automatic$/,
    )
  })

  it("site-controller deployment is available in site-a", () => {
    const { stdout } = kubectl(
      [
        "get",
        "deployment",
        SITE_CONTROLLER_DEPLOYMENT,
        "-o",
        "jsonpath={.status.availableReplicas}",
      ],
      { namespace: SITE_NAMESPACE },
    )
    expect(Number(stdout)).toBeGreaterThanOrEqual(1)
  })

  it("skupper-router pod is running in site-a", () => {
    const { stdout } = kubectl(
      [
        "get",
        "pods",
        "-l",
        ROUTER_LABEL_SELECTOR,
        "-o",
        "jsonpath={.items[0].status.phase}",
      ],
      { namespace: SITE_NAMESPACE },
    )
    expect(stdout).toBe("Running")
  })

  it("site-controller startup log markers are present", async () => {
    const logs = await waitForPodLogMarkers(
      SITE_CONTROLLER_LABEL,
      SC_STARTUP_LOG_MARKERS,
      SITE_NAMESPACE,
      30_000,
      /Site controller initialization failed/i,
    )
    expect(logs).not.toMatch(/Site controller initialization failed/i)
  }, 60_000)

  describe("site API via port-forward", () => {
    /** @type {{ localPort: number, stop: () => void } | undefined} */
    let portForward

    beforeAll(async () => {
      portForward = await startSitePortForward(SITE_CONTROLLER_LABEL)
    }, 120_000)

    afterAll(() => {
      portForward?.stop()
    })

    it("GET /api/v1alpha1/hostnames returns manage access point ingress bundle", async () => {
      const { body, entry } = await waitForHostnamesEntry(
        portForward.localPort,
        TEST_MANAGE_AP_ID,
      )

      expect(body).not.toBeNull()
      expect(Array.isArray(body)).toBe(false)
      expect(typeof entry.host).toBe("string")
      expect(entry.host.length).toBeGreaterThan(0)
      expect(Number(entry.port)).toBeGreaterThan(0)
    })
  })

  it("manage access point ingress appears in Postgres after state sync", async () => {
    const row = await waitForAccessPointRow(TEST_MANAGE_AP_ID, {
      hostname: TEST_MANAGE_AP_HOSTNAME,
      port: TEST_MANAGE_AP_PORT,
      lifecycle: "ready",
    })
    expect(row.hostname).toBe(TEST_MANAGE_AP_HOSTNAME)
    expect(row.port).toBe(TEST_MANAGE_AP_PORT)
    expect(row.lifecycle).toBe("ready")
  }, 300_000)

  it("manage access-point TLS secret exists in site namespace", async () => {
    await waitForSecret(TEST_MANAGE_AP_TLS_SECRET)
    expect(secretHasTlsCert(TEST_MANAGE_AP_TLS_SECRET)).toBe(true)
  }, 300_000)

  it("management-controller logs AMQP connection to site manage access point", async () => {
    const logs = await waitForMcLog(/Connecting to Access Point:/)
    expect(logs).toMatch(/Connecting to Access Point:/)
  }, 300_000)
})
