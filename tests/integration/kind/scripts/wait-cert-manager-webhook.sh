#!/usr/bin/env bash
# Block until cert-manager webhook Deployment is ready and accepting connections.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

echo "Waiting for cert-manager controller..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager --timeout=300s

echo "Waiting for cert-manager webhook deployment..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${CERT_MANAGER_NAMESPACE}" rollout status deployment/cert-manager-webhook --timeout=300s

echo "Waiting for cert-manager webhook pods..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${CERT_MANAGER_NAMESPACE}" wait pod \
  -l app.kubernetes.io/component=webhook \
  --for=condition=Ready \
  --timeout=300s

# Endpoints can lag briefly after pods report Ready.
for attempt in $(seq 1 60); do
  ready=$(
    kubectl --context "${KUBECTL_CONTEXT}" -n "${CERT_MANAGER_NAMESPACE}" get endpointslices \
      -l "kubernetes.io/service-name=cert-manager-webhook" \
      -o jsonpath='{.items[0].endpoints[?(@.conditions.ready==true)].addresses[0]}' 2>/dev/null || true
  )
  if [[ -n "${ready}" ]]; then
    echo "cert-manager webhook endpoint is ready (${ready})"
    exit 0
  fi
  sleep 5
done

echo "cert-manager webhook Service has no ready endpoints after 300s" >&2
exit 1
