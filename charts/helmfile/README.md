# Helmfile deployment (cert-manager, PostgreSQL, Skupper, management-server)

This directory defines a [Helmfile](https://github.com/helmfile/helmfile) environment that installs the supporting stack for the VMS management server: optional **cert-manager**, **PostgreSQL** (Bitnami chart), optional **Skupper** sites for cross-cluster database reachability, and the **management-server** chart. You can target a **single cluster** (everything on one kube context) or **split application and data** across two contexts.

## Prerequisites

* Access to at least one Kubernetes cluster from [any provider you choose][kube-providers].

* The `kubectl` command-line tool, version 1.15 or later ([installation guide][install-kubectl]).

* [Helm](https://helm.sh/docs/intro/install/), [Helmfile](https://github.com/helmfile/helmfile), and [helm-diff](https://github.com/databus23/helm-diff) installed on the machine where you run `helmfile`.

* A kubeconfig that can reach every cluster you reference. For multi-cluster, merge kubeconfigs (see below).

* **Multi-cluster only:** [Skupper](https://skupper.io/) must be usable on both clusters (operator and `skupper.io` CRDs installed, per Skupper’s documentation for your environment). The Helmfile creates `Site`, `Listener`, and `Connector` resources; it does not install the Skupper control plane for you.

* **cert-manager:** The default Helmfile release uses the Jetstack OCI chart. If you already run cert-manager on the application cluster, set `deploy.certManager: false` in values and skip that release.

  [kube-providers]: https://skupper.io/start/kubernetes.html
  [install-kubectl]: https://kubernetes.io/docs/tasks/tools/install-kubectl/

## Concept and layout

* **Application tier** — Runs the management server (and optionally cert-manager). In `helmfile.yaml.gotmpl`, releases that belong on the application cluster use `clusters.applicationKubeContext` when it is non-empty; otherwise they use your current kubectl context.

* **Data tier** — Runs PostgreSQL. Those releases use `clusters.dataKubeContext` when set; if `dataKubeContext` is empty, it defaults to the same value as `applicationKubeContext`, which yields a **single-cluster** layout.

* **Multi-cluster detection** — When `applicationKubeContext` and `dataKubeContext` resolve to **different** strings, Helmfile treats the deployment as multi-cluster: it enables the two Skupper chart releases (`skupper-app-site` and `skupper-cross-cluster`) so a **Listener** on the app side and a **Connector** on the data side can expose PostgreSQL to the application cluster over Skupper. When both contexts are the same (or both empty), those Skupper releases are **not** installed.

* **Values entrypoint** — The `default` environment loads `./values/common.yaml`. Edit that file (or add another file under `environments.default.values` in `helmfile.yaml.gotmpl`) to change cluster selection, Postgres settings, and component toggles.

## Configuration reference

The most important keys live in **`values/common.yaml`**.

### `deploy`

Boolean flags select which Helm releases to install:

| Key                 | Release / effect                                      |
| ------------------- | ----------------------------------------------------- |
| `deploy.certManager` | Jetstack cert-manager into `cert-manager` namespace |
| `deploy.postgresql`  | Bitnami PostgreSQL on the data context / namespace   |
| `deploy.managementServer` | management-server chart on the application context |

### `postgres`

Used by the PostgreSQL chart (via `values/postgres.yaml.gotmpl`) and passed through to **management-server** as `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`. Adjust `host` and `port` so the **management-server pod** can reach the database (in single-cluster this is usually the in-cluster Service name, e.g. `postgresql`; in multi-cluster it is often the Skupper **listener** hostname you configure, e.g. `postgresql`).

Nested `postgres.persistence` controls PVC size, storage class, and whether persistence is enabled for the Bitnami primary.

### `clusters`

| Field                       | Purpose |
| --------------------------- | ------- |
| `applicationKubeContext`    | Context name for cert-manager and management-server. Empty = current context. |
| `dataKubeContext`           | Context name for PostgreSQL (and Skupper data site when multi-cluster). Empty = same as `applicationKubeContext`. |
| `dataNamespace`             | Namespace for the PostgreSQL release and the prepare-hook that applies `db-init-configmap`. Empty = Helmfile default namespace behavior for that release. |
| `dataCreateNamespace`       | If `true`, create `dataNamespace` before installing PostgreSQL. |
| `postgresImagePullSecret`   | If set, passed as Bitnami `global.imagePullSecrets` for pulls from registries that need auth. |
| `skupperLinkAccessCluster`  | **Multi-cluster only:** which side exposes the Skupper **link** endpoint: `app` (application cluster site) or `data` (data cluster site). Must match the cluster that is actually reachable from the other side for linking. If unset, neither site receives `linkAccess` from Helmfile (see chart default `linkAccessEnabled` in `skupper-cross-cluster`). |
| `skupperLinkAccess`         | Skupper `Site` `spec.linkAccess` value for the public site (e.g. `default`, `route`, `loadbalancer`), when the matching cluster is selected above. |

## Components (Helm releases)

| Release                 | Chart / source                    | Typical cluster | Role |
| ----------------------- | --------------------------------- | ----------------- | ---- |
| `cert-manager`          | OCI Jetstack cert-manager         | Application       | TLS issuers / certificates for the app stack (optional via `deploy.certManager`). |
| `postgresql`            | Bitnami PostgreSQL                | Data (or same)   | Database; init SQL from `resources/db-setup.sql` via prepare-hook ConfigMap `db-init-configmap`. |
| `skupper-app-site`      | `../skupper-cross-cluster`        | Application       | **Multi-cluster only:** `Site` + `Listener` so the app cluster can dial a logical Postgres host. |
| `skupper-cross-cluster` | `../skupper-cross-cluster`        | Data              | **Multi-cluster only:** `Site` + `Connector` selecting the PostgreSQL Service. |
| `management-server`     | `../management-server`            | Application       | VMS management server Deployment and related objects. |

Repository `bitnami` is declared for the PostgreSQL chart; add other repos in `helmfile.yaml.gotmpl` if you add charts that need them.

## Deploying on a single cluster

1. Ensure `kubectl` points at the target cluster (`kubectl config current-context`).

2. Edit **`values/common.yaml`**:
   * Leave **`clusters.applicationKubeContext`** and **`clusters.dataKubeContext`** empty (or set both to the same context name).
   * Set **`postgres`** credentials, database name, and persistence as required.
   * Set **`deploy`** flags for the components you want (commonly all `true` for a full stack).

3. From the **`charts/helmfile`** directory, preview then apply:

   ~~~ shell
   cd charts/helmfile
   helmfile -e default diff
   helmfile -e default apply
   ~~~

4. Confirm releases on the cluster (namespace depends on your Helmfile defaults and `dataNamespace`):

   ~~~ shell
   kubectl get pods -A | grep -E 'cert-manager|postgresql|management-server'
   ~~~

**NOTE:** With a single cluster, Skupper releases are **not** installed; `postgres.host` in `common.yaml` should be the Kubernetes DNS name of the PostgreSQL Service the management-server pod can resolve (typically `postgresql` in the same namespace as the server, depending on release layout).

## Deploying across two clusters

1. Log in to both clusters and merge kubeconfigs so **both contexts** appear in one file. For example:

   ~~~ shell
   export KUBECONFIG=~/.kube/cluster-a:~/.kube/cluster-b
   kubectl config get-contexts
   ~~~

2. Edit **`values/common.yaml`**:
   * Set **`clusters.applicationKubeContext`** to the context that runs **management-server** (and cert-manager if enabled).
   * Set **`clusters.dataKubeContext`** to the context that runs **PostgreSQL** (must differ from the application context to trigger multi-cluster Skupper).
   * Set **`clusters.dataNamespace`** to the namespace where PostgreSQL should run; use **`dataCreateNamespace: true`** if Helmfile should create it.
   * Set **`clusters.skupperLinkAccessCluster`** to **`app`** or **`data`** according to which cluster is **publicly reachable** for Skupper link establishment; set **`clusters.skupperLinkAccess`** if you need something other than the default (for example `route` on OpenShift).
   * Align **`postgres.host`** / **`postgres.port`** with how the management-server pod reaches Postgres after Skupper is linked (commonly the listener **host** name configured in the Skupper chart, often `postgresql`).

3. Ensure Skupper is installed and CRDs are available on **both** clusters.

4. From **`charts/helmfile`**, run:

   ~~~ shell
   cd charts/helmfile
   helmfile -e default diff
   helmfile -e default apply
   ~~~

5. Complete any Skupper-specific steps your environment requires (tokens, AccessGrants, firewall or DNS for the cluster that has **link access**). Those workflows are defined by Skupper and your platform; the Helmfile only declares the Site/Listener/Connector resources with the values above.

**NOTE:** Multi-cluster assumes you can run `kubectl` with `--context` (Helmfile sets `kubeContext` per release). The PostgreSQL **prepare** hook uses the same data context and namespace as the PostgreSQL release to create or update `db-init-configmap`.

## Related documentation

* Broader VMS setup (console, backbone, vans) is described in the repository’s **[getting-started](../../docs/notes/getting-started.md)** note. That document covers manual YAML and local development flows; this README is specific to the **Helmfile** charts under `charts/helmfile`.
