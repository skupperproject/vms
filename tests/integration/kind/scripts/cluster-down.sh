#!/usr/bin/env bash
# Tear down Kind cluster and helmfile releases.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  if command -v helmfile >/dev/null 2>&1; then
    echo "Destroying helmfile releases (-e kind)..."
    (
      cd "${REPO_ROOT}/charts/helmfile"
      helmfile -e kind destroy || true
    )
  fi

  echo "Deleting Kind cluster ${CLUSTER_NAME}..."
  kind delete cluster --name "${CLUSTER_NAME}"
else
  echo "Kind cluster ${CLUSTER_NAME} does not exist; nothing to do."
fi
