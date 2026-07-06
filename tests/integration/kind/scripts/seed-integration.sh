#!/usr/bin/env bash
# Issue integration site client cert and seed backbone rows in Postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

echo "Waiting for root CA certificate ${ROOT_CA_CERT}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" wait "certificate/${ROOT_CA_CERT}" \
  --for=condition=Ready --timeout=300s

echo "Updating Configuration.SiteControllerImage to ${SC_IMAGE}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" exec statefulset/"${POSTGRES_STATEFULSET}" -- \
  bash -lc "PGPASSWORD=\$(cat /opt/bitnami/postgresql/secrets/postgres-password) psql -h 127.0.0.1 -U postgres -d studiodb -c \
  \"UPDATE configuration SET sitecontrollerimage = '${SC_IMAGE}' WHERE id = 0;\""

echo "Issuing site TLS certificate via cert-manager..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${TEST_SITE_CERT_SECRET}
spec:
  secretName: ${TEST_SITE_CERT_SECRET}
  issuerRef:
    name: ${ROOT_ISSUER}
    kind: Issuer
  commonName: ${TEST_SITE_NAME}
  usages:
    - client auth
    - digital signature
    - key encipherment
EOF

echo "Waiting for site certificate ${TEST_SITE_CERT_SECRET}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" wait "certificate/${TEST_SITE_CERT_SECRET}" \
  --for=condition=Ready --timeout=300s

MANAGE_AP_DNS="skupper-router-local.${SITE_NAMESPACE}.svc.cluster.local"
MANAGE_AP_TLS_SECRET="skx-access-${TEST_MANAGE_AP_ID}"
echo "Issuing manage access-point TLS certificate (${MANAGE_AP_TLS_SECRET})..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${MANAGE_AP_TLS_SECRET}
spec:
  secretName: ${MANAGE_AP_TLS_SECRET}
  issuerRef:
    name: ${ROOT_ISSUER}
    kind: Issuer
  commonName: ${MANAGE_AP_DNS}
  dnsNames:
    - ${MANAGE_AP_DNS}
  usages:
    - server auth
    - digital signature
    - key encipherment
EOF

echo "Waiting for manage AP certificate ${MANAGE_AP_TLS_SECRET}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" wait "certificate/${MANAGE_AP_TLS_SECRET}" \
  --for=condition=Ready --timeout=300s

SQL_FILE="${ROOT}/fixtures/backbone/integration-seed.sql"
echo "Seeding backbone site rows from ${SQL_FILE}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" exec -i statefulset/"${POSTGRES_STATEFULSET}" -- \
  bash -lc "PGPASSWORD=\$(cat /opt/bitnami/postgresql/secrets/postgres-password) psql -h 127.0.0.1 -U postgres -d studiodb -v ON_ERROR_STOP=1" \
  < "${SQL_FILE}"

echo "Updating manage AP hostname for site namespace ${SITE_NAMESPACE}..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" exec statefulset/"${POSTGRES_STATEFULSET}" -- \
  bash -lc "PGPASSWORD=\$(cat /opt/bitnami/postgresql/secrets/postgres-password) psql -h 127.0.0.1 -U postgres -d studiodb -c \
  \"UPDATE backboneaccesspoints SET hostname = '${MANAGE_AP_DNS}' WHERE id = '${TEST_MANAGE_AP_ID}';\""

site_count="$(kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" exec statefulset/"${POSTGRES_STATEFULSET}" -- \
  bash -lc "PGPASSWORD=\$(cat /opt/bitnami/postgresql/secrets/postgres-password) psql -h 127.0.0.1 -U postgres -d studiodb -tAc \
  \"SELECT COUNT(*) FROM interiorsites WHERE id = '${TEST_SITE_ID}' AND deploymentstate = 'ready-bootstrap';\"")"
if [[ "${site_count}" != "1" ]]; then
  echo "ERROR: expected 1 InteriorSites row in ready-bootstrap, got ${site_count}" >&2
  exit 1
fi

ap_ready="$(kubectl --context "${KUBECTL_CONTEXT}" -n "${NAMESPACE}" exec statefulset/"${POSTGRES_STATEFULSET}" -- \
  bash -lc "PGPASSWORD=\$(cat /opt/bitnami/postgresql/secrets/postgres-password) psql -h 127.0.0.1 -U postgres -d studiodb -tAc \
  \"SELECT COUNT(*) FROM backboneaccesspoints WHERE id = '${TEST_MANAGE_AP_ID}' AND lifecycle = 'ready' AND certificate IS NOT NULL;\"")"
if [[ "${ap_ready}" != "1" ]]; then
  echo "ERROR: expected manage access point ready with certificate, got ${ap_ready}" >&2
  exit 1
fi

echo "Database seed complete: InteriorSites + manage AP verified."
