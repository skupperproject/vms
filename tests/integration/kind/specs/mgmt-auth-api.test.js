/*
 * authenticated REST CRUD via in-cluster Keycloak (password grant + Bearer).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MC_DEPLOYMENT, TEST_BACKBONE_ID } from "../config.js";
import { requireCluster, waitDeploymentReady } from "../../helpers/kubectl.js";
import { startMcPortForward, mcFetch } from "../../helpers/api-client.js";
import {
    startKeycloakPortForward,
    fetchAdminAccessToken,
    fetchViewerAccessToken,
    bearerAuth,
} from "../../helpers/keycloak.js";

describe("authenticated REST API via Keycloak", () => {
    /** @type {{ localPort: number, stop: () => void } | undefined} */
    let mcPortForward;
    /** @type {{ localPort: number, stop: () => void } | undefined} */
    let keycloakPortForward;
    /** @type {string | undefined} */
    let adminToken;
    /** @type {string | undefined} */
    let viewerToken;

    beforeAll(async () => {
        requireCluster();
        waitDeploymentReady(MC_DEPLOYMENT);
        keycloakPortForward = await startKeycloakPortForward();
        adminToken = await fetchAdminAccessToken(keycloakPortForward.localPort);
        viewerToken = await fetchViewerAccessToken(keycloakPortForward.localPort);
        mcPortForward = await startMcPortForward();
    }, 600_000);

    afterAll(() => {
        mcPortForward?.stop();
        keycloakPortForward?.stop();
    });

    it("GET /backbones returns 401 without Bearer token", async () => {
        const res = await mcFetch(mcPortForward.localPort, "/api/v1alpha1/backbones", {
            headers: { Accept: "application/json" },
        });
        expect(res.status).toBe(401);
    });

    it("GET /backbones returns 403 for authenticated user without list role", async () => {
        const res = await mcFetch(mcPortForward.localPort, "/api/v1alpha1/backbones", {
            headers: {
                Accept: "application/json",
                ...bearerAuth(viewerToken),
            },
        });
        expect(res.status).toBe(403);
    });

    it("GET /backbones returns seeded backbone for admin token", async () => {
        const res = await mcFetch(mcPortForward.localPort, "/api/v1alpha1/backbones", {
            headers: {
                Accept: "application/json",
                ...bearerAuth(adminToken),
            },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        const seeded = body.find((row) => row.id === TEST_BACKBONE_ID);
        expect(seeded).toMatchObject({
            id: TEST_BACKBONE_ID,
            name: "integration-backbone",
            lifecycle: "ready",
        });
    });

    it("GET /backbones/:id returns a single backbone", async () => {
        const res = await mcFetch(
            mcPortForward.localPort,
            `/api/v1alpha1/backbones/${TEST_BACKBONE_ID}`,
            {
                headers: {
                    Accept: "application/json",
                    ...bearerAuth(adminToken),
                },
            }
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe(TEST_BACKBONE_ID);
        expect(body.name).toBe("integration-backbone");
    });

    it("POST /backbones creates a backbone and DELETE removes it", async () => {
        const name = `integration-auth-${Date.now()}`;

        const createRes = await mcFetch(mcPortForward.localPort, "/api/v1alpha1/backbones", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...bearerAuth(adminToken),
            },
            body: JSON.stringify({ name }),
        });
        expect(createRes.status).toBe(201);
        const created = await createRes.json();
        expect(created.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        const readRes = await mcFetch(
            mcPortForward.localPort,
            `/api/v1alpha1/backbones/${created.id}`,
            {
                headers: {
                    Accept: "application/json",
                    ...bearerAuth(adminToken),
                },
            }
        );
        expect(readRes.status).toBe(200);
        const row = await readRes.json();
        expect(row.name).toBe(name);
        expect(row.id).toBe(created.id);

        const deleteRes = await mcFetch(
            mcPortForward.localPort,
            `/api/v1alpha1/backbones/${created.id}`,
            {
                method: "DELETE",
                headers: bearerAuth(adminToken),
            }
        );
        expect(deleteRes.status).toBe(204);

        const goneRes = await mcFetch(
            mcPortForward.localPort,
            `/api/v1alpha1/backbones/${created.id}`,
            {
                headers: {
                    Accept: "application/json",
                    ...bearerAuth(adminToken),
                },
            }
        );
        expect(goneRes.status).toBe(400);
        expect(await goneRes.text()).toContain("Not Found");
    }, 120_000);

    it("GET /user/profile returns authenticated admin identity", async () => {
        const res = await mcFetch(mcPortForward.localPort, "/api/v1alpha1/user/profile", {
            headers: {
                Accept: "application/json",
                ...bearerAuth(adminToken),
            },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.name).toBe("Integration Admin");
    });
});
