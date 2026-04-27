# VMS deployment

This directory defines a [Helmfile](https://github.com/helmfile/helmfile) environment that installs the supporting stack for the VMS management controller: **cert-manager** (Jetstack OCI chart), **PostgreSQL** (Bitnami chart for application data), and the local **management-server** chart. All releases use your **current** `kubectl` context and the namespace Helmfile uses for each run (see Helmfile’s `--namespace` flag if you need a fixed namespace).

Identity (for example **Keycloak**) is **not** installed by this Helmfile; run it separately and supply the management controller with a **`keycloak-config`** Secret as described below.

## Prerequisites

- Access to at least one Kubernetes cluster ([Kubernetes providers][kube-providers]).

- The `kubectl` command-line tool, version 1.15 or later ([installation guide][install-kubectl]).

- **[Helm](https://helm.sh/docs/intro/install/)** on the machine where you run Helmfile.

- **[Helmfile](https://github.com/helmfile/helmfile)** on your `PATH`.

- **[helm-diff](https://github.com/databus23/helm-diff)** as a Helm plugin so `helmfile diff` works:

  ```shell
  helm plugin install https://github.com/databus23/helm-diff
  ```

- A kubeconfig for the cluster where you run `helmfile sync`.

- **Storage:** Persistent workloads need a default `StorageClass` or explicit `postgres.persistence.storageClass` in `values/common.yaml`.

- **cert-manager:** The default release uses the Jetstack OCI chart (`v1.20.0` in `helmfile.yaml.gotmpl`). If cert-manager is already installed on the target cluster, set `deploy.certManager: false`.

  [kube-providers]: https://kubernetes.io/docs/concepts/overview/components/
  [install-kubectl]: https://kubernetes.io/docs/tasks/tools/install-kubectl/

## Credentials (Kubernetes Secrets)

Charts do **not** embed database passwords in `values/common.yaml`. Create the Secret **before** `helmfile sync`. Names and keys are configurable under `postgres.credentialsSecret` in `values/common.yaml`.

### Application PostgreSQL (`postgresql` release + `management-server`)

Create a Secret (default name **`postgresql-credentials`**) in:

- the **PostgreSQL** release namespace (Bitnami uses it for the superuser password and for init env vars), and  
- the **management-server** release namespace (same Secret name for `APP_USER_PASSWORD` / `APP_SYSTEM_PASSWORD`).

If those namespaces differ, duplicate the Secret in both places with the same keys.

| Key (default)         | Purpose |
| --------------------- | ------- |
| `postgres-password`   | Bitnami superuser password (`auth.existingSecret` / `secretKeys.adminPasswordKey`). |
| `app-user-password`   | Passed to `db-setup.sql` and into the management controller as `APP_USER_PASSWORD`. |
| `app-system-password` | Same for `APP_SYSTEM_PASSWORD` / role `app_system`. |

Example:

```shell
kubectl create secret generic postgresql-credentials \
  --from-literal=postgres-password='REPLACE_SUPERUSER' \
  --from-literal=app-user-password='REPLACE_APP_USER' \
  --from-literal=app-system-password='REPLACE_APP_SYSTEM' \
  -n <postgresql-namespace>

kubectl create secret generic postgresql-credentials \
  --from-literal=postgres-password='REPLACE_SUPERUSER' \
  --from-literal=app-user-password='REPLACE_APP_USER' \
  --from-literal=app-system-password='REPLACE_APP_SYSTEM' \
  -n <management-server-namespace>
```

## Keycloak adapter (manual)

The **management-server** chart mounts OAuth adapter configuration from a Kubernetes Secret named **`keycloak-config`** (key `keycloak.json`). That Secret is **not** created by Helmfile or the chart.

1. Run **Keycloak** (or another OIDC provider) however you operate it.
2. Configure the realm and client per the [Keycloak setup guide](../../docs/notes/keycloak-setup.md).
3. Create the Secret in the **same namespace** as the management-server release:

   ```shell
   kubectl create secret generic keycloak-config \
     --from-file=/path/to/your-keycloak.json \
     -n <management-server-namespace>
   ```

Until `keycloak-config` exists and matches your IdP, management controller pods may not behave correctly.

## Concept and layout

- **Releases** — **cert-manager** (namespace `cert-manager`), **postgresql** (no fixed namespace in the Helmfile; use Helmfile’s default or `--namespace`), and **management-server** (same). The prepare hook runs `kubectl` against the **current** context to create or update `db-init-configmap` in the active namespace for that hook (typically the namespace where PostgreSQL is being installed).

- **Values entrypoint** — `environments.default.values` loads `./values/common.yaml`.

## Configuration reference

### `deploy`

| Key | Release / effect |
| --- | ---------------- |
| `deploy.certManager` | Jetstack cert-manager into `cert-manager` namespace |
| `deploy.postgresql` | Bitnami PostgreSQL |
| `deploy.managementServer` | management-server chart |

### `postgres`

Used by `values/postgres.yaml.gotmpl` and passed to **management-server** as `PGHOST`, `PGPORT`, `PGDATABASE`. **`postgres.credentialsSecret`** supplies Bitnami `auth.existingSecret` and `secretKeyRef` env for init SQL (see [Credentials](#credentials-kubernetes-secrets)).

## Components (Helm releases)

| Release | Chart / source | Role |
| ------- | -------------- | ---- |
| `cert-manager` | OCI `quay.io/jetstack/charts/cert-manager` | TLS (optional via `deploy.certManager`). |
| `postgresql` | Bitnami `postgresql` `18.3.0` | App DB; init SQL from `resources/db-setup.sql` via prepare-hook `db-init-configmap`. |
| `management-server` | `../management-server` | VMS management controller. |

Repository `bitnami` is declared in `helmfile.yaml.gotmpl` for the PostgreSQL chart.

## Deploying

1. Point `kubectl` at the target cluster (`kubectl config current-context`).
2. Edit **`values/common.yaml`** (`postgres.*`, `deploy.*`).
3. Create **`postgresql-credentials`** (and later **`keycloak-config`**) per [Credentials](#credentials-kubernetes-secrets) and [Keycloak adapter](#keycloak-adapter-manual), in the namespaces where you install each release.
4. From **`charts/helmfile`**:

   ```shell
   cd charts/helmfile
   helmfile sync
   ```

Use `helmfile apply` for incremental changes. Target a release with `-l component=<label>` (see `helmfile.yaml.gotmpl`). Use Helmfile’s **`--namespace`** (or defaults) so PostgreSQL, the prepare hook, and management-server agree on where `db-init-configmap` and Secrets live.

**NOTE:** `postgres.host` must be a hostname the management-server pod can resolve (often `postgresql.<namespace>.svc` or `postgresql` when sharing a namespace).

To install components on **different** clusters, run Helmfile separately with the appropriate `kubectl` context and values (for example different `postgres.host`); this Helmfile does not switch kube contexts for you.

## Related documentation

- Broader VMS setup is in **[getting-started](../../docs/notes/getting-started.md)**. This README covers only the Helmfile under `charts/helmfile`.
