# Kind integration tests

End-to-end tests run against a local [Kind](https://kind.sigs.k8s.io/) cluster. They exercise the **management controller** with **PostgreSQL**, **cert-manager**, and **Keycloak**; a **backbone site** in namespace `site-a` (Skupper, site-controller, bootstrap YAML, hostnames API, state-sync, AMQP manage link); and **authenticated REST** via Keycloak Bearer tokens.

## Prerequisites

- [kind](https://kind.sigs.k8s.io/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [helm](https://helm.sh/) and [helmfile](https://github.com/helmfile/helmfile)
- [helm-diff](https://github.com/databus23/helm-diff) plugin
- Docker (build + `kind load docker-image`)
- Network access during `cluster-up` (Skupper install YAML + multi-van CRDs from GitHub)

## Quick start

From the repo root:

```shell
pnpm install
pnpm test:integration:local
```

This creates cluster `vms-kind`, builds MC and site-controller images, deploys the stack via `helmfile -e kind`, installs Skupper, seeds backbone rows, runs all integration specs, then deletes the cluster (`pnpm run cluster:down`). Cluster teardown runs even when tests fail.

If the cluster is already up:

```shell
pnpm test:integration
```

Run a single spec file:

```shell
pnpm exec vitest run --project integration tests/integration/kind/specs/backbone-bootstrap.test.js
```

## Manual cluster lifecycle

```shell
pnpm cluster:up       # create cluster and deploy the full stack
pnpm test:integration # run integration tests
pnpm cluster:down     # helmfile destroy + delete cluster
```

Port-forward the management API (optional):

```shell
kubectl --context kind-vms-kind -n vms-test port-forward svc/management-server 18085:8085
```

## Layout

| Path                        | Purpose                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `kind-config.yaml`          | Single control-plane node; host port **8085** mapped to node **30085**                 |
| `helmfile/values-kind.yaml` | Overlay: `vms-test` namespace, local image, Postgres without PV                        |
| `fixtures/keycloak/`        | Keycloak 26 dev mode + imported `vms-test` realm (in-cluster `http://keycloak:8080`) |
| `fixtures/backbone/`        | SQL seed for integration backbone site                                                 |
| `scripts/`                  | `cluster-up`, `cluster-down`, `install-skupper`, `seed-integration`, `wait-ready`    |
| `specs/`                    | Vitest integration specs                                                               |

Helmfile environment **`kind`** is defined in `charts/helmfile/helmfile.yaml.gotmpl`.

## Environment variables

| Variable                   | Default                          | Description                                      |
| -------------------------- | -------------------------------- | ------------------------------------------------ |
| `VMS_KIND_CLUSTER`         | `vms-kind`                       | Kind cluster name                                |
| `VMS_TEST_NAMESPACE`       | `vms-test`                       | Management stack namespace                       |
| `VMS_SITE_NAMESPACE`       | `site-a`                         | Backbone site namespace                          |
| `VMS_MC_IMAGE`             | `vms-management-controller:kind` | Local MC image tag                               |
| `VMS_SC_IMAGE`             | `vms-site-controller:kind`       | Local site-controller image                      |
| `VMS_MC_LOCAL_PORT`        | `18085`                          | Local port for MC port-forward                   |
| `VMS_SITE_LOCAL_PORT`      | `11040`                          | Local port for site-controller port-forward      |
| `VMS_SKUPPER_NAMESPACE`    | `skupper`                        | Skupper controller namespace                     |
| `VMS_POSTGRES_PASSWORD`    | `integration-postgres`           | Bitnami superuser password                       |
| `VMS_APP_USER_PASSWORD`    | `integration-app-user`           | `app_user` role password                         |
| `VMS_KEYCLOAK_LOCAL_PORT`  | `18080`                          | Local port for Keycloak port-forward in auth tests |
| `VMS_KEYCLOAK_ADMIN_USER`  | `integration-admin`              | Admin test user (Bearer token in auth spec)      |
| `VMS_KEYCLOAK_VIEWER_USER` | `integration-viewer`             | Viewer test user (no list roles)                 |

`cluster-up.sh` installs cert-manager first, waits for the validating webhook, then PostgreSQL and management-server, then builds the site-controller image, installs Skupper, and runs the SQL seed.

If `skupper-router` init container `config-init` crash-loops, verify the controller has the multi-van images for `SKUPPER_KUBE_ADAPTOR_IMAGE` and `SKUPPER_CONTROLLER_IMAGE` set (the standard Skupper images cannot initialize a multi-van router). Re-run `./tests/integration/kind/scripts/install-skupper.sh` to reinstall and patch Skupper with the multi-van images.

Bootstrap YAML includes the manage AP TLS secret as **`vms-access-{accessPointId}`** (same name RouterAccess expects) and a `RouterAccess` CR. cert-manager issues that secret in the MC namespace first; bootstrap copies it into the site namespace. The MC may also push the same secret via AMQP state-sync when the site connects.

`seed-integration.sh` issues the manage AP server cert under `vms-access-${TEST_MANAGE_AP_ID}` and marks the access point **`ready`** in Postgres (TlsCertificates.ObjectName must match the cert-manager secret name).

If the access secret is still missing after bootstrap, re-seed and restart the site-controller:

```shell
./tests/integration/kind/scripts/seed-integration.sh
kubectl -n "${VMS_SITE_NAMESPACE:-site-a}" rollout restart deployment/vms-site
```

Reset Kubernetes site resources and re-run the backbone spec:

```shell
kubectl -n "${VMS_SITE_NAMESPACE:-site-a}" delete deployment skupper-router vms-site --ignore-not-found
kubectl -n "${VMS_SITE_NAMESPACE:-site-a}" delete routeraccess --all --ignore-not-found
kubectl -n "${VMS_SITE_NAMESPACE:-site-a}" delete site,network --all --ignore-not-found
pnpm exec vitest run --project integration tests/integration/kind/specs/backbone-bootstrap.test.js
```

## What the specs cover

### `mgmt-health` and `mgmt-certs`

- Postgres tables from `db-setup.sql` exist; `Configuration` row present
- `management-server` deployment ready; pod Running/Ready
- HTTP responds on port-forward (401 for unauthenticated API request)
- cert-manager: `vms-root-ca` Ready, `vms-root` issuer present
- MC logs contain startup markers; `ManagementControllers` row created

### `backbone-bootstrap`

- SQL seed: backbone + interior site ready for bootstrap with manage access point
- Bootstrap YAML applied to `site-a` (generated in-test from `resource-templates`)
- `vms-site` deployment and `skupper-router` pod Running
- Site API `GET /api/v1alpha1/hostnames` returns JSON
- Manage access point hostname/port synced to Postgres via state-sync
- Manage AP TLS secret `vms-access-{accessPointId}` present in site namespace
- MC logs `Connecting to Access Point:` (AMQP manage link)

### `mgmt-auth-api`

- Keycloak realm `vms-test` with client `vms-management-controller`
- `GET /backbones` returns 401 without token, 403 for viewer without list role
- Admin Bearer token lists seeded backbone and reads `/user/profile`
- `POST /backbones` + `DELETE /backbones/:id` round-trip CRUD

Test users (password grant via port-forward): `integration-admin` / `integration-admin`, `integration-viewer` / `integration-viewer`.
