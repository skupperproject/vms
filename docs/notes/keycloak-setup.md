# Keycloak setup for the management controller

[Keycloak](https://www.keycloak.org/) provides authentication for the management controller API and console. The controller uses [keycloak-connect](https://www.npmjs.com/package/keycloak-connect) with a `keycloak.json` adapter file and **realm roles** on each route. Postgres **row-level security** also uses the Keycloak **groups** and **userId** carried in the access token.

## Part 1: Install Keycloak

Install Keycloak by any method that suits your environment. A full list of supported options and instructions can be found [here](https://www.keycloak.org/guides).

## Part 2: Configure Keycloak for the management controller

Log into the Keycloak admin console. Initial admin credentials are typically stored in a Kubernetes secret or set manually when deploying/starting Keycloak.

### Step 1: Create a Realm

Create or choose a **realm**. You can create a new realm from scratch or import an existing realm's resources, including clients, realm roles, and groups.

### Step 2: Create a confidential OIDC client

1. Create a **client** the management controller will use to talk to Keycloak.
2. Set **Valid redirect URIs** and **Web origins** to match where users reach the UI/API—for local dev, `http://localhost:8085/*` is typical. For a deployed server, use the public URL.
3. Enable **Client authentication** (confidential client) and **Standard flow** (authorization code).
4. After creating the client, open **Client scopes** → **\<client\>-dedicated** → **Configure a new mapper** → **Group membership**:
   - Set **Token Claim Name** to **`clientGroups`** (the controller reads this claim for RLS and the `/user/groups` API endpoint).
   - Turn **"Full group path"** **off**.

### Step 3: Add `keycloak.json` file to the management-controller

1. In the admin UI, open the client → **Action** → **Download adapter config** (format: **Keycloak OIDC JSON**).
2. Save the file as **`keycloak.json`** (gitignored; do not commit secrets).
   - **Local dev:** `components/management-controller/keycloak.json` (working directory when you run `node index.js`).
   - **Container:** the sample deployment mounts a secret at **`/app/keycloak.json`** (see `yaml/management-controller.yaml`).

### Step 4: Kubernetes secret (cluster deployment)

Create the secret in the **same namespace** as the controller (for example `vms`):

```shell
kubectl -n vms create secret generic keycloak-config --from-file=./keycloak.json
```

The deployment expects a secret named **`keycloak-config`** with key **`keycloak.json`**, mounted as a file at `/app/keycloak.json`.

### Step 5: Realm roles (API authorization)

Each API route requires a **realm** role in the form `realm:<role-name>` (for example `realm:backbone-owner`). Create these realm roles in Keycloak:

**Primary roles**

- `admin`
- `application-deployer`
- `application-owner`
- `backbone-owner`
- `van-owner`
- `certificate-manager`

**Additional roles** (used for shared list/read style permissions)

- `can-list-accesspoints-backbone`
- `can-list-applications`
- `can-list-backbones`
- `can-list-vans`

**Composite roles**: assign the additional roles to the primary job roles.

| Composite role         | Include                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `admin`                | All of the above                                                        |
| `application-deployer` | `can-list-applications`, `can-list-vans`                                |
| `application-owner`    | `can-list-applications`                                                 |
| `backbone-owner`       | `can-list-accesspoints-backbone`, `can-list-backbones`                  |
| `van-owner`            | `can-list-accesspoints-backbone`, `can-list-backbones`, `can-list-vans` |

In Keycloak: **Realm roles** → select the composite role → **Associated roles** → **Assign role**.

### Step 6: Groups and Postgres row-level security (RLS)

The API stores an **`OwnerGroup`** on many rows (backbones, sites, vans, etc.). RLS allows access when:

- the row's **`Owner`** matches the signed-in user, or
- the user has the admin realm role assigned to them, or
- the row's **`OwnerGroup`** is **`public`**, or
- **`OwnerGroup`** is one of the user's Keycloak groups (from the **`clientGroups`** claim).

For non-admin users you should:

1. Create **groups** in Keycloak to allow users to view resources owned by their group and to create a resource for their group.
2. **Add users to those groups** so their tokens include the right `clientGroups`.

### Step 7: (Optional) Persistent Keycloak storage

For production, configure a supported database for Keycloak as described in [Keycloak server database configuration](https://www.keycloak.org/server/db).

---

**Related:** [Getting started](./getting-started.md) — prerequisites and running the controller with `keycloak.json` in place.
