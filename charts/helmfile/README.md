# VMS deployment

This directory defines a [Helmfile](https://github.com/helmfile/helmfile) environment that installs the supporting stack for the VMS management controller: **cert-manager** (jetstack chart), **Keycloak** (local `keycloak-stack` chart with embedded PostgreSQL for Keycloak’s own data), **PostgreSQL** (Bitnami chart for application data), **Skupper** sites for cross-cluster database reachability (if running cross-cluster), and the **management-server** chart. You can target a **single cluster** (everything on one kube context) or **split application and data** across two contexts.

## Prerequisites

* Access to at least one Kubernetes cluster from [any provider you choose][kube-providers].

* The `kubectl` command-line tool, version 1.15 or later ([installation guide][install-kubectl]).

* **[Helm](https://helm.sh/docs/intro/install/)** on the machine where you run Helmfile (Helmfile invokes Helm for each release).

* **[Helmfile](https://github.com/helmfile/helmfile)** installed and on your `PATH`.

* **[helm-diff](https://github.com/databus23/helm-diff)** installed as a Helm plugin so `helmfile diff` works:

  ~~~ shell
  helm plugin install https://github.com/databus23/helm-diff
  ~~~

* A kubeconfig that can reach every cluster you reference. For multi-cluster, merge kubeconfigs (see below).

* **Ingress (Keycloak):** If `keycloak.ingress.enabled` is `true` in `values/common.yaml`, your cluster needs an Ingress controller matching `keycloak.ingress.className` (for example NGINX).

* **Storage:** Persistent workloads need a default `StorageClass` or explicit `storageClass` values—Bitnami PostgreSQL uses `postgres.persistence.*`; the Keycloak stack’s embedded Postgres uses `keycloak.postgres.persistence.*` in the chart values (see `values/common.yaml` and `../keycloak-stack`).

* **Multi-cluster only:** [Skupper](https://skupper.io/) must be running on both clusters (Skupper controller and `skupper.io` CRDs installed, per Skupper’s documentation for your environment). The Helmfile creates `Site`, `Listener`, and `Connector` resources; it does not install the Skupper control plane for you.

* **cert-manager:** The default release uses the Jetstack OCI chart (`v1.20.0` in `helmfile.yaml.gotmpl`). If cert-manager is already running on the application cluster, set `deploy.certManager: false` and skip that release.

  [kube-providers]: https://skupper.io/start/kubernetes.html
  [install-kubectl]: https://kubernetes.io/docs/tasks/tools/install-kubectl/

## Keycloak and the management controller

The **management-server** chart mounts **Keycloak adapter configuration** from a Kubernetes Secret named **`keycloak-config`**. That Secret is **not** created by this Helmfile or by the management-server chart—you must add it yourself after Keycloak is installed and a client is configured.

For a working deployment:

1. **Deploy Keycloak** (Helmfile release `keycloak`, chart `../keycloak-stack`, namespace `keycloak`).

2. **Configure Keycloak:** Create the realm and a **confidential** OAuth client that matches what the management controller expects. See the [Keycloak setup guide](/docs/notes/keycloak-setup.md) for more details on configuring the client for the managemenet-controller.

3. **Create the Secret** in the **same namespace** as the management-server release (Helmfile does not set a namespace for `management-server`, so it will be installed in whatever namespace you run `helmfile sync` from):

   ~~~ shell
   kubectl create secret generic keycloak-config \
     --from-file=/path/to/your-keycloak.json \
     -n <management-server-namespace>
   ~~~

Until the `keycloak-config` secret exists and matches a real client, the management controller pods may fail to start or behave incorrectly even if Helm installs the release successfully.

## Concept and layout

* **Application tier** — Runs cert-manager, Keycloak, and the management server. In `helmfile.yaml.gotmpl`, releases on the application cluster use `clusters.applicationKubeContext` when it is non-empty; otherwise they use your current kubectl context.

* **Data tier** — Runs Bitnami PostgreSQL. Those releases use `clusters.dataKubeContext` when set; if `dataKubeContext` is empty, it defaults to the same value as `applicationKubeContext`, which yields a **single-cluster** layout.

* **Multi-cluster detection** — When `applicationKubeContext` and `dataKubeContext` resolve to **different** strings, Helmfile treats the deployment as multi-cluster: it enables the two Skupper chart releases (`skupper-app-site` and `skupper-data-site`) so a **Listener** on the app side and a **Connector** on the data side can expose PostgreSQL to the application cluster over Skupper. When both contexts are the same (or both empty), those Skupper releases are **not** installed.

* **Values entrypoint** — The `default` environment loads `./values/common.yaml`. Edit that file (or add another file under `environments.default.values` in `helmfile.yaml.gotmpl`) to change cluster selection, Postgres settings, Keycloak settings, and component toggles.

## Configuration reference

The most important keys live in **`values/common.yaml`**.

### `deploy`

Boolean flags select which Helm releases to install:

| Key | Release / effect |
| --- | ---------------- |
| `deploy.certManager` | Jetstack cert-manager into `cert-manager` namespace |
| `deploy.keycloak` | Keycloak stack (`../keycloak-stack`) into `keycloak` namespace |
| `deploy.postgresql` | Bitnami PostgreSQL on the data context / namespace |
| `deploy.managementServer` | management-server chart on the application context |

### `postgres`

Used by the Bitnami PostgreSQL chart (via `values/postgres.yaml.gotmpl`) and passed through to **management-server** as `PGHOST`, `PGPORT`, `PGDATABASE`. Adjust `host` and `port` so the **management-server pod** can reach the database (in single-cluster this is usually the in-cluster Service name, e.g. `postgresql`; in multi-cluster it is often the Skupper **listener** hostname you configure, e.g. `postgresql`).

Nested `postgres.persistence` controls PVC size, storage class, and whether persistence is enabled for the Bitnami primary.

`postgres.imagePullSecret`, when non-empty, is passed as Bitnami `global.imagePullSecrets` for registry authentication.

### `keycloak`

Merged from `values/common.yaml` into the Keycloak stack chart via `values/keycloak.yaml.gotmpl`: HTTP/TLS, ingress (`className`, `tlsSecret`, `enabled`), `hostname`, and optional **`keycloak.postgres.persistence`** for the chart’s embedded PostgreSQL (see `../keycloak-stack` templates).

### `clusters`

| Field | Purpose |
| ----- | ------- |
| `applicationKubeContext` | Context name for cert-manager, Keycloak, and management-server. Empty = current context. |
| `dataKubeContext` | Context name for PostgreSQL (and Skupper data site when multi-cluster). Empty = same as `applicationKubeContext`. |
| `dataNamespace` | Namespace for the PostgreSQL release and the prepare-hook that applies `db-init-configmap`. Empty = Helmfile default namespace behavior for that release. |
| `dataCreateNamespace` | If `true`, create `dataNamespace` before installing PostgreSQL. |
| `skupperLinkAccessCluster` | **Multi-cluster only:** which side exposes the Skupper **link** endpoint: `app` (application cluster site) or `data` (data cluster site). Must match the cluster that is actually reachable from the other side for linking. If unset, neither site receives `linkAccess` from Helmfile (see chart default `linkAccessEnabled` in `skupper-cross-cluster`). |
| `skupperLinkAccess` | Skupper `Site` `spec.linkAccess` value for the public site (e.g. `default`, `route`, `loadbalancer`), when the matching cluster is selected above. |

## Components (Helm releases)

| Release | Chart / source | Typical cluster | Role |
| ------- | ---------------- | --------------- | ---- |
| `cert-manager` | OCI `quay.io/jetstack/charts/cert-manager` (pinned in `helmfile.yaml.gotmpl`) | Application | TLS issuers / certificates for the app stack (optional via `deploy.certManager`). |
| `keycloak` | `../keycloak-stack` | Application | Keycloak operator/CR and embedded Postgres for Keycloak data (optional via `deploy.keycloak`). |
| `postgresql` | Bitnami PostgreSQL (`18.3.0` in `helmfile.yaml.gotmpl`) | Data (or same) | Application database; init SQL from `resources/db-setup.sql` via prepare-hook ConfigMap `db-init-configmap`. |
| `skupper-app-site` | `../skupper-cross-cluster` | Application | **Multi-cluster only:** `Site` + `Listener` so the app cluster can dial a logical Postgres host. |
| `skupper-data-site` | `../skupper-cross-cluster` | Data | **Multi-cluster only:** `Site` + `Connector` selecting the PostgreSQL Service. |
| `management-server` | `../management-server` | Application | VMS management controller Deployment and related objects. |

Repository `bitnami` is declared for the PostgreSQL chart; add other repos in `helmfile.yaml.gotmpl` if you add charts that need them.

## Deploying on a single cluster

1. Ensure `kubectl` points at the target cluster (`kubectl config current-context`).

2. Edit **`values/common.yaml`**:
   * Leave **`clusters.applicationKubeContext`** and **`clusters.dataKubeContext`** empty (or set both to the same context name).
   * Set **`postgres`** credentials, database name, and persistence as required.
   * Set **`keycloak`** hostname and ingress to match your DNS and controller.
   * Set **`deploy`** flags for the components you want.

3. Deploy the Keycloak chart and create a client in the admin console.

   Create the 'keycloak' namespace and create a secret for the postgres instance called 'keycloak-db-secret' with keys 'username' and 'password' set. Add that user and password to `keycloak.postgres` in the values/common.yaml file.

   To deploy only the Keycloak chart, run:

   ~~~ shell
   helmfile -l component=keycloak sync
   ~~~

   For a full set of instructions on configuring a Keycloak client, see the [Keycloak setup guide](docs/notes/keycloak-setup.md).

4. Create the **`keycloak-config`** Secret (see [Keycloak and the management controller](#keycloak-and-the-management-controller)).

5. From the **`charts/helmfile`** directory, deploy the configured helm charts:

   ~~~ shell
   cd charts/helmfile
   helmfile sync
   ~~~

   **Notes about the `helmfile` command:**
   
   The `helmfile sync` command will essentilly run `helm upgrade --install` on all releases defined in `helmfile.yaml.gotmpl`, regardless of whether or not there were changes to that chart. This is good for the inital deployment, but if making changes to a chart after the initial deployment, run `helmfile apply` to only apply the diffed changes to a single/subset of releases.

   You can also select a specific release to target with the `helmfile` command using `-l component=<component-label>`, as defined in the release in `helmfile.yaml.gotmpl`. 

**NOTE:** With a single cluster, Skupper releases are **not** installed; `postgres.host` in `common.yaml` should be the Kubernetes DNS name of the PostgreSQL Service the management-server pod can resolve (typically `postgresql` in the same namespace as the server, depending on release layout).

## Deploying across two clusters

1. Log in to both clusters and merge kubeconfigs so **both contexts** appear in one file. For example:

   ~~~ shell
   export KUBECONFIG=~/.kube/cluster-a:~/.kube/cluster-b
   kubectl config get-contexts
   ~~~

2. Edit **`values/common.yaml`**:
   * Set **`clusters.applicationKubeContext`** to the context that runs **management-server**, **Keycloak**, and cert-manager if enabled.
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

6. Create **`keycloak-config`** in the management-server namespace as in the single-cluster flow.

**NOTE:** Multi-cluster assumes you can run `kubectl` with `--context` (Helmfile sets `kubeContext` per release). The PostgreSQL **prepare** hook uses the same data context and namespace as the PostgreSQL release to create or update `db-init-configmap`.

## Related documentation

* Broader VMS setup (console, backbone, vans) is described in the repository’s **[getting-started](../../docs/notes/getting-started.md)** note. That document covers manual YAML and local development flows; this README is specific to the **Helmfile** charts under `charts/helmfile`.
