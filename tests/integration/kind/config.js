/*
 * Shared constants for Kind integration tests and cluster scripts.
 */

export const CLUSTER_NAME = process.env.VMS_KIND_CLUSTER || "vms-kind"
export const NAMESPACE = process.env.VMS_TEST_NAMESPACE || "vms-test"
export const KUBECTL_CONTEXT = `kind-${CLUSTER_NAME}`

export const MC_IMAGE =
  process.env.VMS_MC_IMAGE || "vms-management-controller:kind"
export const MC_DEPLOYMENT =
  process.env.VMS_MC_DEPLOYMENT || "management-server"
export const MC_SERVICE = process.env.VMS_MC_SERVICE || "management-server"
export const MC_PORT = Number(process.env.VMS_MC_PORT || 8085)
/** Local port for kubectl port-forward (avoid Kind hostPort 8085 in kind-config.yaml). */
export const MC_LOCAL_PORT = Number(process.env.VMS_MC_LOCAL_PORT || 18085)

export const POSTGRES_RELEASE = "postgresql"
export const POSTGRES_USER = "postgres"
export const POSTGRES_DB = process.env.VMS_POSTGRES_DB || "studiodb"
export const POSTGRES_SECRET = "postgres-credentials"
export const POSTGRES_ADMIN_PASSWORD_KEY = "postgres-password"

export const ROOT_CA_CERT = "skupperx-root-ca"
export const ROOT_ISSUER = "skupperx-root"

/** backbone site namespace and images. */
export const SITE_NAMESPACE = process.env.VMS_SITE_NAMESPACE || "site-a"
export const SC_IMAGE = process.env.VMS_SC_IMAGE || "vms-site-controller:kind"
export const SITE_LOCAL_PORT = Number(process.env.VMS_SITE_LOCAL_PORT || 11040)

export const SITE_CONTROLLER_DEPLOYMENT = "skupperx-site"
export const ROUTER_LABEL_SELECTOR = "application=skupper-router"
export const SITE_CONTROLLER_LABEL = "app.kubernetes.io/name=skupperx-site"

/** Keycloak OIDC (in-cluster service DNS). */
export const KEYCLOAK_SERVICE = "keycloak"
export const KEYCLOAK_PORT = 8080
export const KEYCLOAK_LOCAL_PORT = Number(process.env.VMS_KEYCLOAK_LOCAL_PORT || 18080)
export const KEYCLOAK_REALM = "vms-test"
export const KEYCLOAK_CLIENT_ID = "vms-management-controller"
export const KEYCLOAK_CLIENT_SECRET = "integration-test-secret"
export const KEYCLOAK_ADMIN_USER =
  process.env.VMS_KEYCLOAK_ADMIN_USER || "integration-admin"
export const KEYCLOAK_ADMIN_PASSWORD =
  process.env.VMS_KEYCLOAK_ADMIN_PASSWORD || "integration-admin"
export const KEYCLOAK_VIEWER_USER =
  process.env.VMS_KEYCLOAK_VIEWER_USER || "integration-viewer"
export const KEYCLOAK_VIEWER_PASSWORD =
  process.env.VMS_KEYCLOAK_VIEWER_PASSWORD || "integration-viewer"

/** Fixed UUIDs for deterministic SQL seed and bootstrap YAML (see integration-seed.sql). */
export const TEST_BACKBONE_ID = "00000000-0000-4000-8000-000000000001"
export const TEST_SITE_ID = "00000000-0000-4000-8000-000000000002"
export const TEST_MANAGE_AP_ID = "00000000-0000-4000-8000-000000000004"
export const TEST_SITE_NAME = "site-a"
export const TEST_SITE_CERT_SECRET = "vms-site-cert-integration"

/** TLS secret name RouterAccess uses: skx-access-{accessPointId}. */
export const TEST_MANAGE_AP_TLS_SECRET = `skx-access-${TEST_MANAGE_AP_ID}`

/** Expected manage access point endpoint after seed-integration.sh (matches integration-seed.sql). */
export const TEST_MANAGE_AP_HOSTNAME = `skupper-router-local.${SITE_NAMESPACE}.svc.cluster.local`
export const TEST_MANAGE_AP_PORT = "5671"

/** Tables created by charts/helmfile/resources/db-setup.sql (smoke subset). */
export const EXPECTED_TABLES = [
  "Configuration",
  "ManagementControllers",
  "Backbones",
  "InteriorSites",
  "TlsCertificates",
]

/** Log lines emitted during successful mc-main startup. */
export const MC_STARTUP_LOG_MARKERS = [
  "[Config module starting]",
  "[API Server module started]",
  "[Management controller initialization completed successfully]",
]

/** Log lines emitted during successful site-controller startup. */
export const SC_STARTUP_LOG_MARKERS = [
  "[Ingress Skupper v2 module started]",
  "[Site controller initialization completed successfully]",
]
