# `@vms/modules` — Agent Guide

Shared library for SkupperVMS: AMQP, kube helpers, protocol messages, state-sync, logging, and utilities. Pure, reusable code used by both MC and SC.

## Scope

Edit this package when adding or changing helpers shared by MC and SC. Do not put Express routes, Postgres access, OIDC, UI logic, or controller-specific orchestration here.

## Key modules

Library only — no standalone process.

**Prefer subpath imports**. The root namespace import (@vms/modules) remains available for compatibility.

| Import                    | Module                                                 |
| ------------------------- | ------------------------------------------------------ |
| `@vms/modules/amqp`       | AMQP connection/sender helpers                         |
| `@vms/modules/common`     | Shared constants (addresses, annotations, state types) |
| `@vms/modules/kube`       | Kubernetes object load/apply helpers                   |
| `@vms/modules/log`        | Logging                                                |
| `@vms/modules/protocol`   | Claim/protocol message builders                        |
| `@vms/modules/router`     | Router management helpers                              |
| `@vms/modules/state-sync` | Peer state sync (works over AMQP)                      |
| `@vms/modules/util`       | Small utilities                                        |

## Conventions

- **Side-effect-free on import** — modules initialize only when `Start()` (or equivalent) is called with injected deps.
- **No Express, `pg`, or component deps** — keep this package free of controller/UI packages.
- **Constants live in `common.js`** — AMQP addresses, K8s annotation keys (`vms/state-*`, `vms/tls-inject`, …), state types, object names. Prefer reusing these constants rather than introducing new annotation keys or object names.
- Prefer named exports; controllers typically use subpath imports.

## Testing

Colocated unit tests: `src/*.test.js`. Prefer pure unit tests; mock I/O at module boundaries when needed.

Shared Vitest rules and layout: [docs/notes/testing.md](../docs/notes/testing.md).

## Constraints

- Do **not** add controller or console logic here — keep it in MC/SC/console.
- Keep this package free of HTTP/API and DB concerns. `state-sync` is designed to run over AMQP, not tied to HTTP.
- Do not introduce secrets or env-specific config; callers pass configuration in.
- **Preserve backwards compatibility** — changes to exported modules affect both controllers. Avoid breaking public APIs unless the change is explicitly requested.
