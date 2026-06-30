#!/usr/bin/env bash
# Wait for core cluster resources to become ready.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

echo "Waiting for cert-manager webhook..."
"${ROOT}/scripts/wait-cert-manager-webhook.sh"

echo "Waiting for cert-manager cainjector..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager-cainjector --timeout=300s

echo "Waiting for PostgreSQL in ${NAMESPACE}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" rollout status statefulset/"${POSTGRES_STATEFULSET}" --timeout=300s

echo "Waiting for Keycloak..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" rollout status deployment/keycloak --timeout=300s

echo "Waiting for management-server..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" rollout status deployment/"${MC_DEPLOYMENT}" --timeout=300s

echo "Waiting for root CA certificate..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" wait certificate/"${ROOT_CA_CERT}" --for=condition=Ready --timeout=300s

echo "Cluster is ready for integration specs."
