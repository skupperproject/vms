#!/usr/bin/env bash
# Install Skupper v2 controller with multi-van CRDs and images.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../config.sh
source "${ROOT}/config.sh"

echo "Ensuring namespace ${SITE_NAMESPACE}..."
kubectl --context "${KUBECTL_CONTEXT}" create namespace "${SITE_NAMESPACE}" --dry-run=client -o yaml \
  | kubectl --context "${KUBECTL_CONTEXT}" apply -f -

echo "Applying multi-van Skupper CRDs..."
for crd in \
  skupper_network_crd.yaml \
  skupper_network_link_crd.yaml \
  skupper_inter_network_ingress_crd.yaml \
  skupper_network_access_crd.yaml \
  skupper_certificate_request_crd.yaml
do
  kubectl --context "${KUBECTL_CONTEXT}" apply -f "${SKUPPER_CRD_BASE}/${crd}"
done

echo "Installing Skupper controller (${SKUPPER_INSTALL_URL})..."
kubectl --context "${KUBECTL_CONTEXT}" apply -f "${SKUPPER_INSTALL_URL}"

echo "Patching Skupper controller to multi-van images..."
# Skupper 2.2 controller deployment has a single "controller" container; router/adaptor
# images for site pods are driven by SKUPPER_*_IMAGE env vars on that container.
kubectl --context "${KUBECTL_CONTEXT}" -n "${SKUPPER_NAMESPACE}" set image deployment/skupper-controller \
  controller="${SKUPPER_CONTROLLER_IMAGE}"

kubectl --context "${KUBECTL_CONTEXT}" -n "${SKUPPER_NAMESPACE}" set env deployment/skupper-controller \
  SKUPPER_KUBE_ADAPTOR_IMAGE="${SKUPPER_ADAPTOR_IMAGE}" \
  SKUPPER_ROUTER_IMAGE="${SKUPPER_ROUTER_IMAGE}" \
  SKUPPER_KUBE_ADAPTOR_IMAGE_PULL_POLICY=IfNotPresent \
  SKUPPER_ROUTER_IMAGE_PULL_POLICY=IfNotPresent \
  --containers=controller

echo "Extending skupper-controller ClusterRole for multi-van resources..."
if ! kubectl --context "${KUBECTL_CONTEXT}" patch clusterrole skupper-controller --type=json -p='[
  {"op":"add","path":"/rules/-","value":{
    "apiGroups":["skupper.io"],
    "resources":[
      "networks","networks/status",
      "internetworkingresses","internetworkingresses/status",
      "networklinks","networklinks/status",
      "networkaccesses","networkaccesses/status",
      "certificaterequests","certificaterequests/status"
    ],
    "verbs":["get","list","watch","create","update","patch","delete"]
  }}
]'; then
  echo "ClusterRole patch skipped (rules may already exist)"
fi

echo "Waiting for skupper-controller..."
kubectl --context "${KUBECTL_CONTEXT}" -n "${SKUPPER_NAMESPACE}" rollout status deployment/skupper-controller --timeout=300s

echo "Removing router deployments created with stock kube-adaptor (controller will recreate them)..."
for ns in "${SITE_NAMESPACE}" "${NAMESPACE}"; do
  kubectl --context "${KUBECTL_CONTEXT}" -n "${ns}" delete deployment skupper-router --ignore-not-found
done

echo "Skupper controller is ready."
