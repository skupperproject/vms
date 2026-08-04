# management-server chart — Agent Guide

Helm chart that packages the management controller (MC) as a Kubernetes Deployment with Service, Ingress/HTTPRoute, RBAC, and cert-manager resources.

## Scope

Edit this chart for **MC pod packaging**: image, env, mounts, networking, RBAC, and cert CRs. Release toggles and Postgres/image overlays live in [../helmfile/](../helmfile/AGENTS.md).

## Commands

```bash
# From repo root — render with chart defaults (no cluster required)
helm template mgmt charts/management-server

# Full-stack / overlay values: use Helmfile
cd charts/helmfile && helmfile -l component=management-server template
cd charts/helmfile && helmfile -l component=management-server apply
```

`helmfile apply` requires a live cluster/`kubectl` context. There are no in-repo chart unit tests — validate with `helm template` and cluster apply.

## Key Files

| Template                    | Role                                                    |
| --------------------------- | ------------------------------------------------------- |
| `templates/deployment.yaml` | MC Deployment; PG* / APP_* env; `keycloak-config` mount |
| `templates/certs.yaml`      | cert-manager Certificate / Issuer resources             |
| `templates/rbac.yaml`       | RBAC for the controller SA                              |
| `values.yaml`               | Chart defaults (image, postgres, ingress, probes)       |

Helmfile overlay: [values/management-server.yaml.gotmpl](../helmfile/values/management-server.yaml.gotmpl) (Postgres settings + image from `common.yaml`).

## Conventions

- Mounts Secret **`keycloak-config`** at **`/app/keycloak.json`** (`subPath: keycloak.json`).
- Prefer exposing configuration through `values.yaml` rather than hardcoding template values.

## Constraints

- Chart changes must stay aligned with MC env expectations and cert-manager CRs.
- Do not embed secrets or Keycloak JSON in values; require pre-created Secrets (`postgres-credentials`, `keycloak-config`).
- Do not add site-controller deployment manifests — SC is applied via MC-generated bootstrap/invitation YAML, not this chart.
- Prefer Helmfile for multi-release installs; this chart can also be installed alone with standard Helm.
- Keep chart env and mounts consistent with what MC expects at runtime.
