# Testing

Deep reference for unit and integration tests. Package-specific notes live in each package’s `AGENTS.md`. Cross-cutting monorepo rules: root [AGENTS.md](../../AGENTS.md).

## Commands

Always run Vitest from the **repo root**. Package `"test"` scripts in MC/SC are stubs.

```bash

# unit tests
pnpm test:unit                        # unit tests (run before every PR)
pnpm vitest run <path/to/file.test.js>  # single test file

# Integration tests (requires Kind cluster) — only for deploy / cross-component / cluster-facing changes
pnpm test:integration:local           # cluster up → tests → cluster down
pnpm test:integration                 # runs integration tests against an existing Kind cluster with VMS already deployed
pnpm cluster:up                       # start Kind cluster only
pnpm cluster:down                     # tear down Kind cluster only

# unit + integration tests
pnpm test                             # all Vitest projects (unit + integration; requires cluster up)
pnpm test:watch                       # watch mode
pnpm test:coverage                    # coverage report
```

Do **not** run Kind/integration for ordinary unit or single-controller edits. `pnpm test:unit` is the default local gate.

## Vitest layout

Config: [vitest.config.js](../../vitest.config.js).

| Project       | Include                                                                                                                        | Notes                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `unit`        | `modules/src/**/*.test.js`, `components/management-controller/src/**/*.test.js`, `components/site-controller/src/**/*.test.js` | Default local gate before PRs                            |
| `integration` | `tests/integration/kind/specs/**/*.test.js`                                                                                    | Needs Kind cluster; longer timeouts; no file parallelism |

`globals: false` — always import `describe`, `it`, `expect`, `vi` from `vitest`. Environment is `node`.

**Console is excluded.** `components/console` has `App.test.jsx` but it is not in the unit project. UI behavior is validated via MC integration / manual use.

Contributors should run `pnpm test:unit` locally before opening a PR.

## Colocated unit tests

Place tests next to source: `foo.js` → `foo.test.js` under the same `src/` tree.

| Package                  | Helpers                                        |
| ------------------------ | ---------------------------------------------- |
| `modules/`               | Prefer pure unit tests; mock I/O at boundaries |
| `management-controller/` | `src/test-helpers/`                            |
| `site-controller/`       | `src/test-helpers/build-site-api-app.js`       |

### Mocking patterns

- Mock at **I/O boundaries** with `vi.mock()` (DB, kube, AMQP, HTTP clients, filesystem) — not internals under test.
- Prefer `async (importOriginal) => ({ ...await importOriginal(), ...overrides })` when only part of a module should be stubbed.
- Controllers: mock `@vms/modules/*` and local modules like `./db.js`, `./notify.js` as neighboring tests do.

### MC API tests (supertest)

Helpers in `components/management-controller/src/test-helpers/`:

| Helper             | Role                                                          |
| ------------------ | ------------------------------------------------------------- |
| `build-api-app.js` | Express app with mock OIDC + admin/user (optional MC) routers |
| `mock-auth.js`     | Auth double: `x-test-auth` / `x-test-roles`                   |
| `mock-db.js`       | DB doubles for query paths                                    |

Authenticate requests with header `x-test-auth: 1`. Optional `x-test-roles` is a comma-separated list of realm roles (defaults come from `buildApiApp` / `createMockAuth`).

```js
import request from "supertest";
import { buildApiApp } from "./test-helpers/build-api-app.js";

const { app } = await buildApiApp();
await request(app).get("/some/path").set("x-test-auth", "1").expect(200);
```

### SC API tests

Use `buildSiteApiApp({ backboneMode, includeMemberApi })` from `components/site-controller/src/test-helpers/build-site-api-app.js`. Pass `backboneMode` correctly — it changes which routes are mounted. Drive routes with **supertest** (no port bind).

## Integration tests

Kind-based specs under `tests/integration/kind/specs/` (health, certs, auth API, backbone bootstrap). Use the commands above (`pnpm test:integration:local`, or `pnpm cluster:up` / `pnpm test:integration` / `pnpm cluster:down`).

Prerequisites, layout, env vars, and troubleshooting: [tests/integration/kind/README.md](../../tests/integration/kind/README.md). Helmfile env `kind` overlays values from `tests/integration/kind/helmfile/values-kind.yaml`.
