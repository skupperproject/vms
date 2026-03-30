# Helmfile

Postgres is always a **ClusterIP** Service on the data cluster. Reach it from your machine with **`kubectl port-forward`**, and point **management-server** at the host/port your app pod sees (often **`host.minikube.internal`** and the local forward port, not `127.0.0.1` from inside the pod).

## Multi-cluster

Configure **`values/clusters.yaml`**:

| Field | Releases | Purpose |
|-------|----------|---------|
| `applicationKubeContext` | cert-manager, management-server | App cluster. Empty = current kubectl context. |
| `dataKubeContext` | postgresql | Data cluster. Empty = same as `applicationKubeContext`. |
| `dataNamespace` | postgresql (+ db-init hook) | Target namespace / project. |
| `dataCreateNamespace` | postgresql | If `true`, create namespace before install. |
| `postgresHost` | management-server **PGHOST** | Set when app and DB are on different clusters (or you override in-cluster DNS). Example: `host.minikube.internal` if the forward listens on your host. |
| `postgresPort` | management-server **PGPORT** | Set to your forwarded port (e.g. `15432` after `kubectl port-forward svc/postgresql 15432:5432`). |
| `postgresImagePullSecret` | postgresql | Docker Hub pull secret name in `dataNamespace`; `""` to omit. |

**Typical flow**

1. Install **postgresql** on the data cluster (ClusterIP only).
2. Run **`kubectl port-forward --context <data> -n <ns> svc/postgresql 15432:5432`** (or bind on `0.0.0.0` if the pod must reach it via the host).
3. Set **`postgresHost`** / **`postgresPort`** in **`clusters.yaml`** to what **management-server’s pod** should use, then **`helmfile apply`**.

**Override:** `postgres.applicationHost` in **`values/common.yaml`** wins over **`clusters.postgresHost`** for PGHOST.

**Same-cluster:** leave **`postgresHost`** and **`postgresPort`** empty; **`postgres.host`** / **`postgres.port`** in `common.yaml` apply (in-cluster Service DNS).

**Prepare hook:** The postgresql `db-init-configmap` hook uses the same `--context` and `--namespace` as the postgresql release when those are set.

## Single-cluster default

Leave **`applicationKubeContext`** and **`dataKubeContext`** empty. Postgres stays ClusterIP; management-server uses **`postgresql:5432`** from `common.yaml` unless you set **`postgresHost`** / **`postgresPort`**.
