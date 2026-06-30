# Keycloak integration fixture

Deploys Keycloak in dev mode with imported **`vms-test`** realm at in-cluster **`http://keycloak:8080`**.

- MC `keycloak.json`: `auth-server-url` → `http://keycloak:8080`
- `KC_HOSTNAME=http://keycloak:8080` so JWT issuers match in-cluster OIDC discovery
- Test users: `integration-admin` / `integration-admin`, `integration-viewer` / `integration-viewer`
