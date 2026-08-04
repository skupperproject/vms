# Helmfile — Agent Guide

Deploy the full SkupperVMS management plane stack via Helmfile: cert-manager, PostgreSQL, and the local management-server chart.

## Scope

Edit this directory for **release orchestration**, **values overlays**, and **DB init hooks**. Application chart templates belong in [../management-server/](../management-server/).

Helmfile installs the management plane only (cert-manager, Postgres, MC). Site controller is applied via MC-generated bootstrap/invitation YAML, not as a Helmfile release.

## Commands

```bash
cd charts/helmfile

helmfile sync                              # install/sync all enabled releases
helmfile apply                             # incremental apply with diffs
helmfile -l component=cert-manager apply   # single release by label
helmfile -l component=postgresql apply
helmfile -l component=management-server apply
helmfile destroy                           # tear down all releases
helmfile -l component=postgresql destroy   # selective destroy
```

Uses the current `kubectl` context. Requires Helm, Helmfile, and the `helm-diff` plugin.

## Key Files

| Path                                   | Role                                             |
| -------------------------------------- | ------------------------------------------------ |
| `helmfile.yaml.gotmpl`                 | Releases, labels, needs, hooks                   |
| `values/common.yaml`                   | Shared values for all charts                     |
| `values/postgres.yaml.gotmpl`          | Bitnami PostgreSQL values                        |
| `values/management-server.yaml.gotmpl` | Overlay for the MC chart                         |
| `resources/db-setup.sql`               | Schema applied via ConfigMap on Postgres presync |
| `resources/drop.sql`                   | Optional manual teardown (not used by Helmfile)  |

Environments: `default` and `kind` (kind adds `tests/integration/kind/helmfile/values-kind.yaml`).

## Conventions

- **Passwords are not in values** — create Secrets before install:
    - `postgres-credentials` (keys from `common.yaml`: `postgres-password`, `app-user-password`, `app-system-password`) in the Postgres **and** management-server namespaces if they differ
    - `keycloak-config` with key `keycloak.json` in the management-server namespace (Helmfile does not create it)
- **Release labels:** `component=cert-manager|postgresql|management-server`
- **DB init:** Postgres `presync` hook applies ConfigMap `db-init-configmap` from `resources/db-setup.sql`
- **Prefer values over template logic:** Expose configuration through values rather than adding conditional behavior directly in templates unless necessary.

## Constraints

- Never put credentials or Keycloak JSON into values files or commit them.
- Schema/object changes must update `resources/db-setup.sql` **and** MC code.
- Do not add site-controller deployment manifests here — SC is not a Helmfile release.
- Keycloak is **not** installed here — only the adapter Secret is expected.
- Postgres namespace may differ from the MC namespace (`releases.postgresql.namespace`); empty means current kubectl namespace
- Align kubectl namespace with where Postgres is installed so the init ConfigMap lands correctly.
