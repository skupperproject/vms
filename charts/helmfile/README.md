# VMS deployment

The **`charts/helmfile`** directory is a [Helmfile](https://github.com/helmfile/helmfile) environment that installs:

| Chart | Role |
| ----- | ---- |
| **cert-manager** | Jetstack OCI chart (`v1.20.0`) — TLS issuers / certificates (optional). |
| **postgresql** | Bitnami `postgresql` `18.3.0` — application database; schema from `resources/db-setup.sql`. |
| **management-server** | Local chart at `../management-server` — VMS management controller. This chart can be depoyed/managed by itself with standard Helm commands. |

Helmfile uses your **current** `kubectl` context. Namespace behavior is described below.

Keycloak is **not** installed here. Supply the controller with a **`keycloak-config`** Secret as in [Keycloak adapter](#keycloak-adapter).

## Layout under `charts/`

```
charts/
├── helmfile/                 # This README
│   ├── helmfile.yaml.gotmpl
│   ├── values/
│   │   ├── common.yaml       # postgres.* + releases.*
│   │   ├── postgres.yaml.gotmpl
│   │   └── management-server.yaml.gotmpl
│   └── resources/
│       ├── db-setup.sql      # Applied to Postgres on init (via ConfigMap)
│       └── drop.sql          # Optional manual teardown helper (not used by Helmfile)
└── management-server/        # Helm chart for the management controller
```

## Prerequisites

- **[kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)** (1.15+).

- **[Helm](https://helm.sh/docs/intro/install/)** and **[Helmfile](https://github.com/helmfile/helmfile)** on your `PATH`.

- **[helm-diff](https://github.com/databus23/helm-diff)**:

  ```shell
  helm plugin install https://github.com/databus23/helm-diff
  ```

- Keycloak instance running and configured (see [Keycloak Setup](/docs/notes/keycloak-setup.md)).

## Credentials (Kubernetes Secrets)

Passwords are **not** stored in `values/common.yaml`. Create Secrets **before** install; names and keys come from **`postgres.credentialsSecret`** (defaults below).

### PostgreSQL + management-server

Create **`postgres-credentials`** (default name from `common.yaml`) in:

1. The **same namespace as the PostgreSQL release**.  
2. The **same namespace as the management-server release**.

If Postgres and management-server run in different namespaces, duplicate the Secret in both with identical keys.

| Key (defaults in `common.yaml`) | Purpose |
| ------------------------------- | ------- |
| `postgres-password` | Bitnami superuser (`auth.secretKeys.adminPasswordKey`). |
| `app-user-password` | `db-setup.sql` and management controller `APP_USER_PASSWORD`. |
| `app-system-password` | `db-setup.sql` and management controller `APP_SYSTEM_PASSWORD`. |

Example:

```shell
kubectl create secret generic postgres-credentials \
  --from-literal=postgres-password='REPLACE_SUPERUSER_PASSWORD' \
  --from-literal=app-user-password='REPLACE_APP_USER_PASSWORD' \
  --from-literal=app-system-password='REPLACE_APP_SYSTEM_PASSWORD' \
  -n <namespace>
```

## Keycloak adapter

The **management-server** chart expects a Secret **`keycloak-config`** with key **`keycloak.json`**. Helmfile does not create it.

1. Create a Keycloak instance that the management-controller can connect to.  
2. Configure the client per [Keycloak setup guide](../../docs/notes/keycloak-setup.md).  
3. Create the Secret in the management-server namespace:

   ```shell
   kubectl create secret generic keycloak-config \
     --from-file=/path/to/your-keycloak.json \
     -n <management-server-namespace>
   ```

## Configuration (`values/common.yaml`)

### `releases`

Toggles and PostgreSQL namespace (from inline comments in `common.yaml`):

| Key | Purpose |
| --- | ------- |
| `releases.certManager.enabled` | Install Jetstack cert-manager into namespace **`cert-manager`** (created if missing). |
| `releases.postgresql.enabled` | Install Bitnami PostgreSQL. |
| `releases.postgresql.namespace` | If **non-empty**, PostgreSQL is installed in that namespace (`createNamespace: true`). If **empty**, the release uses the current namespace used when running the helmfile command.**). |
| `releases.managementServer.enabled` | Install `../management-server`. Namespace follows Helmfile’s default unless you set release-level namespace in `helmfile.yaml.gotmpl`. |

### `postgres`

Used by **`values/postgres.yaml.gotmpl`** for Bitnami auth, persistence, and init SQL env vars. Passed through **`values/management-server.yaml.gotmpl`** as `PGHOST`, `PGPORT`, `PGDATABASE`, and `credentialsSecret` for app role passwords.

Set **`postgres.host`** / **`postgres.port`** to a hostname and port reachable from management-server pods (for example `postgresql` or `postgresql.<namespace>.svc.cluster.local`).

## Database init hook

Before sync, Helmfile runs a **`presync`** hook that applies ConfigMap **`db-init-configmap`** from **`resources/db-setup.sql`**. The `kubectl` command passes **`-n <namespace>`** when **`releases.postgresql.namespace`** is set; otherwise it uses your current kubectl namespace context—align that with where PostgreSQL is installed so the ConfigMap lands in the correct namespace.

## Components (Helm releases)

| Release | Source | Installed when |
| ------- | ------ | -------------- |
| `cert-manager` | `oci://quay.io/jetstack/charts/cert-manager` | `releases.certManager.enabled` |
| `postgresql` | `bitnami/postgresql` `18.3.0` | `releases.postgresql.enabled` |
| `management-server` | `../management-server` | `releases.managementServer.enabled` |

Select a specific release to manage with **`helmfile -l component=<label>`** (labels are `cert-manager`, `postgresql`, `management-server` in `helmfile.yaml.gotmpl`).

## Deploying

1. Edit **`values/common.yaml`**: **`releases.*`**, **`postgres.*`**.  
2. Create **`postgres-credentials`** (and **`keycloak-config`** when ready) in the required namespaces.  
3. From **`charts/helmfile`**:

   ```shell
   cd charts/helmfile
   helmfile sync
   ```

Use **`helmfile apply`** for incremental diffs. To release an individual chart, run `helmfile -l component=<label> apply`.

## Teardown

To destroy all resources created by the Helmfile releases (including the management server, PostgreSQL, and cert-manager, if installed), use:

```shell
helmfile destroy
```

You can selectively destroy a single release (component) using the label, just like for deploys. For example, to tear down only the Bitnami PostgreSQL release:

```shell
helmfile -l component=postgresql destroy
```

Or, for cert-manager:

```shell
helmfile -l component=cert-manager destroy
```

This will remove the resources managed by the specified release from your cluster. Double-check your namespace/context to ensure the correct resources are modified.

## Related documentation

- **[getting-started](../../docs/notes/getting-started.md)** — broader VMS setup. This file documents only **`charts/helmfile`** and the **`management-server`** chart path used from it.
