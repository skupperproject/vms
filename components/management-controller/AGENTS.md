# Management controller (MC) — Agent Guide

Central control plane for SkupperVMS: Postgres, admin/user APIs, certificate management, kube sync, claim server, and console host.

## Scope

Edit this package for **MC-specific** orchestration: REST APIs, DB access, cert lifecycle, management/colo sync, OIDC/session auth, and K8s resource templates. Shared helpers belong in [`@vms/modules`](../../modules/AGENTS.md).

## Commands

```bash
# From this directory (components/management-controller/)
node index.js          # or: pnpm start — HTTP :8085, prefix /api/v1alpha1/
```

Image packaging uses the root [Containerfile](../../Containerfile) (`pnpm deploy`), not a local `app/` bundle.

Package `"test"` is a stub — always run tests from the repo root.
`.env` must live in `components/management-controller/` (same directory as `index.js`). See README.md for supported environment variables.

## Architectural ownership

| Responsibility                     | Source of truth            |
| ---------------------------------- | -------------------------- |
| Admin/User REST APIs               | api-admin.js / api-user.js |
| HTTP server                        | mc-apiserver.js            |
| Authentication                     | auth/management-oidc.js    |
| Database access / RLS              | db.js                      |
| Certificate hierarchy and rotation | certs.js                   |
| Kubernetes resource generation     | resource-templates.js      |
| Management-plane state sync        | sync-management.js         |
| Colocated namespace sync           | colo-sync.js               |
| Postgres change notifications      | notify.js                  |
| Live watch for console             | watch-server.js            |

## Project invariants

- API route definitions live in `api-admin.js`, `api-user.js`, and `mc-apiserver.js`; treat these as the source of truth over `docs/notes/api.md`.
- Database access goes through `db.js`, which establishes the OIDC RLS context.

## Conventions

- **Dual PG pools** (`app_user` / `app_system`); RLS via Keycloak `clientGroups` / `sub`.
    - System-triggered transactions → `ClientFromPool("system")`
    - User-triggered transactions → `ClientFromPool()`
- **Use queryWithContext for user-initiated database work** — API requests acting on behalf of a user should use queryWithContext. When writing to RLS-protected tables, pass userInfo into the callback. See src/api-admin.js for examples.
- **Prefer watches over polling** - Where possible, prefer the watch/notify practice over polling the database.

## Testing

Colocated tests: `src/*.test.js`, `src/auth/*.test.js`.

- Helpers: `src/test-helpers/` — `mock-db.js`, `mock-auth.js`, `build-api-app.js`.
- Supertest + `x-test-auth: 1` (optional `x-test-roles`); mock auth sets `req.kauth` / `clientGroups`.

Shared Vitest rules and layout: [docs/notes/testing.md](../../docs/notes/testing.md).

## Constraints

- Preserve OIDC/session checks on auth and API bootstrap paths.
- Do not inline K8s YAML outside `resource-templates.js`.
- DB schema changes → MC code **and** [`charts/helmfile/resources/db-setup.sql`](../../charts/helmfile/resources/db-setup.sql).
- No shared MC/SC helpers here — put those in `modules/`.
- Never commit `.env`, or `keycloak.json` (place `keycloak.json` here for local OIDC).
