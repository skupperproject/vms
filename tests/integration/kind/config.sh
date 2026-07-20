#!/usr/bin/env bash
# Shared shell configuration for Kind integration scripts.
set -euo pipefail

export VMS_KIND_CLUSTER="${VMS_KIND_CLUSTER:-vms-kind}"
export VMS_TEST_NAMESPACE="${VMS_TEST_NAMESPACE:-vms-test}"
export VMS_MC_IMAGE="${VMS_MC_IMAGE:-vms-management-controller:kind}"
export VMS_MC_PORT="${VMS_MC_PORT:-8085}"

export CLUSTER_NAME="${VMS_KIND_CLUSTER}"
export NAMESPACE="${VMS_TEST_NAMESPACE}"
export KUBECTL_CONTEXT="kind-${CLUSTER_NAME}"
export MC_IMAGE="${VMS_MC_IMAGE}"
export MC_PORT="${VMS_MC_PORT}"
export MC_DEPLOYMENT="${VMS_MC_DEPLOYMENT:-management-server}"
export MC_SERVICE="${VMS_MC_SERVICE:-management-server}"
export CERT_MANAGER_NAMESPACE="${VMS_CERT_MANAGER_NAMESPACE:-cert-manager}"
export POSTGRES_STATEFULSET="${VMS_POSTGRES_STATEFULSET:-postgresql}"
export ROOT_CA_CERT="${VMS_ROOT_CA_CERT:-skupperx-root-ca}"
export ROOT_ISSUER="${VMS_ROOT_ISSUER:-skupperx-root}"
export POSTGRES_IMAGE="${VMS_POSTGRES_IMAGE:-bitnami/postgresql:latest}"
export KEYCLOAK_IMAGE="${VMS_KEYCLOAK_IMAGE:-quay.io/keycloak/keycloak:26.6.4}"
export KEYCLOAK_ADMIN_USER="${VMS_KEYCLOAK_ADMIN_USER:-integration-admin}"
export KEYCLOAK_ADMIN_PASSWORD="${VMS_KEYCLOAK_ADMIN_PASSWORD:-integration-admin}"
export KEYCLOAK_VIEWER_USER="${VMS_KEYCLOAK_VIEWER_USER:-integration-viewer}"
export KEYCLOAK_VIEWER_PASSWORD="${VMS_KEYCLOAK_VIEWER_PASSWORD:-integration-viewer}"

export SITE_NAMESPACE="${VMS_SITE_NAMESPACE:-site-a}"
export SC_IMAGE="${VMS_SC_IMAGE:-vms-site-controller:kind}"
export SITE_CONTROLLER_DEPLOYMENT="${VMS_SITE_CONTROLLER_DEPLOYMENT:-skupperx-site}"
export SKUPPER_NAMESPACE="${VMS_SKUPPER_NAMESPACE:-skupper}"
export SKUPPER_INSTALL_URL="${VMS_SKUPPER_INSTALL_URL:-https://github.com/skupperproject/skupper/releases/download/2.2.0/skupper-cluster-scope.yaml}"
export SKUPPER_CRD_BASE="${VMS_SKUPPER_CRD_BASE:-https://github.com/fgiorgetti/skupper/raw/refs/heads/multi-van/config/crd/bases}"
export SKUPPER_CONTROLLER_IMAGE="${VMS_SKUPPER_CONTROLLER_IMAGE:-quay.io/fgiorgetti/controller:multi-van}"
export SKUPPER_ADAPTOR_IMAGE="${VMS_SKUPPER_ADAPTOR_IMAGE:-quay.io/fgiorgetti/kube-adaptor:multi-van}"
export SKUPPER_ROUTER_IMAGE="${VMS_SKUPPER_ROUTER_IMAGE:-quay.io/skupper/skupper-router:main}"

export TEST_SITE_ID="${VMS_TEST_SITE_ID:-00000000-0000-4000-8000-000000000002}"
export TEST_SITE_NAME="${VMS_TEST_SITE_NAME:-site-a}"
export TEST_MANAGE_AP_ID="${VMS_TEST_MANAGE_AP_ID:-00000000-0000-4000-8000-000000000004}"
export TEST_MANAGE_AP_TLS_SECRET="skx-access-${TEST_MANAGE_AP_ID}"
export TEST_SITE_CERT_SECRET="${VMS_TEST_SITE_CERT_SECRET:-vms-site-cert-integration}"

load_image() {
  local image="$1"
  if ! docker image inspect "${image}" >/dev/null 2>&1; then
    echo "Pulling ${image}..."
    docker pull "${image}"
  fi
  echo "Loading ${image} into Kind..."
  if kind load docker-image "${image}" --name "${CLUSTER_NAME}" 2>/dev/null; then
    return 0
  fi
  echo "kind load failed for ${image}; falling back to ctr import..."
  docker save "${image}" | docker exec -i "${CLUSTER_NAME}-control-plane" \
    ctr --namespace=k8s.io images import -
}


KIND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KIND_DIR
export REPO_ROOT="$(cd "${KIND_DIR}/../../.." && pwd)"
export KIND_CONFIG="${KIND_DIR}/kind-config.yaml"
