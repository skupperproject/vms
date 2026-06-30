#!/usr/bin/env bash
# Create Kind cluster, build/load MC image, deploy stack via helmfile -e kind.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

if ! command -v kind >/dev/null 2>&1; then
  echo "kind is required but not installed" >&2
  exit 1
fi
if ! command -v helm >/dev/null 2>&1; then
  echo "helm is required but not installed" >&2
  exit 1
fi
if ! command -v helmfile >/dev/null 2>&1; then
  echo "helmfile is required but not installed" >&2
  exit 1
fi
if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not installed" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed" >&2
  exit 1
fi

if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  echo "Kind cluster ${CLUSTER_NAME} already exists"
else
  echo "Creating Kind cluster ${CLUSTER_NAME}..."
  kind create cluster --name "${CLUSTER_NAME}" --config "${KIND_CONFIG}"
fi

echo "Building ${MC_IMAGE} from Containerfile target vms-management-controller..."
docker build -f Containerfile --target vms-management-controller -t "${MC_IMAGE}" "${REPO_ROOT}"

echo "Loading image into Kind..."
kind load docker-image "${MC_IMAGE}" --name "${CLUSTER_NAME}"

echo "Pre-loading dependency images into Kind (avoids Docker Hub rate limits in-cluster)..."
load_image "${POSTGRES_IMAGE}"
load_image "${KEYCLOAK_IMAGE}"

echo "Ensuring namespace ${NAMESPACE}..."
kubectl --context "${KUBECTL_CONTEXT}" create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl --context "${KUBECTL_CONTEXT}" apply -f -

echo "Applying Keycloak realm import configmap..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" create configmap keycloak-realm-import \
  --from-file=vms-test.json="${KIND_DIR}/fixtures/keycloak/realm-vms-test.json" \
  --dry-run=client -o yaml | kubectl --context "${KUBECTL_CONTEXT}" apply -f -

echo "Applying Keycloak fixture..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" apply -f "${KIND_DIR}/fixtures/keycloak/deployment.yaml"
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" set image deployment/keycloak keycloak="${KEYCLOAK_IMAGE}" --record=false 2>/dev/null || true

echo "Waiting for Keycloak before management-server..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" rollout status deployment/keycloak --timeout=300s

POSTGRES_PASSWORD="${VMS_POSTGRES_PASSWORD:-integration-postgres}"
APP_USER_PASSWORD="${VMS_APP_USER_PASSWORD:-integration-app-user}"
APP_SYSTEM_PASSWORD="${VMS_APP_SYSTEM_PASSWORD:-integration-app-system}"

echo "Creating postgres-credentials secret..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" create secret generic postgres-credentials \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --from-literal=app-user-password="${APP_USER_PASSWORD}" \
  --from-literal=app-system-password="${APP_SYSTEM_PASSWORD}" \
  --dry-run=client -o yaml | kubectl --context "${KUBECTL_CONTEXT}" apply -f -

echo "Creating keycloak-config secret..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" create secret generic keycloak-config \
  --from-file=keycloak.json="${KIND_DIR}/fixtures/secrets/keycloak.json" \
  --dry-run=client -o yaml | kubectl --context "${KUBECTL_CONTEXT}" apply -f -

echo "Running helmfile sync: cert-manager (-e kind)..."
(
  cd "${REPO_ROOT}/charts/helmfile"
  helmfile -e kind sync -l component=cert-manager
)

"${ROOT}/scripts/wait-cert-manager-webhook.sh"

echo "Running helmfile sync: postgresql + management-server (-e kind)..."
(
  cd "${REPO_ROOT}/charts/helmfile"
  helmfile -e kind sync
)

"${ROOT}/scripts/wait-ready.sh"

echo "=== Installing site-controller image, Skupper, backbone seed ==="
echo "Building ${SC_IMAGE} from Containerfile target vms-site-controller..."
docker build -f Containerfile --target vms-site-controller -t "${SC_IMAGE}" "${REPO_ROOT}"
load_image "${SC_IMAGE}"

load_image "${SKUPPER_CONTROLLER_IMAGE}"
load_image "${SKUPPER_ADAPTOR_IMAGE}"
load_image "${SKUPPER_ROUTER_IMAGE}"

"${ROOT}/scripts/install-skupper.sh"
"${ROOT}/scripts/seed-integration.sh"

echo "Kind cluster is up. Run: pnpm run test:integration"
