# Site controller (SC) — Agent Guide

Per-site orchestration at backbone and member sites: claim redemption, local kube sync, ingress, and participant API.

## Scope

Edit this package for site-local behavior: claim assertion, member/backbone HTTP routes, router ports, ingress bundles, or site kube state sync. Shared helpers go in [`modules/`](../../modules/AGENTS.md); central DB/API/certs stay in the management controller.

Member **claim redemption** (`claim.js`) is separate from **backbone site bootstrap** (MC YAML download / ingress upload / access-points finish — see MC `site-deployment-state.js` and console `SiteDeployment.jsx`).

## Key modules / entry points

- `claim.js` handles the one-time invitation claim flow before a site joins the VAN.
- `sync-site-kube.js` is the authoritative implementation of Kubernetes ↔ AMQP state synchronization.
- `ingress-v2.js` owns hostname bundle generation. Treat this as the source of truth for hostname bundle generation.
- `api-member.js` contains participant-facing API endpoints. Administrative APIs belong in `sc-apiserver.js`.

**Mode flags:** `VMS_BACKBONE=YES|NO` (default `NO`), `VMS_PLATFORM`, `VMS_STANDALONE_NAMESPACE`, `VMS_SITE_ID`.

**Startup:** API always starts first. **Member** mode: `claim.Start()` blocks until claim accepted (no-op on later restarts), then `api-member`. **Backbone** mode: skip claim, run `ingress-v2`. Both wait for local `skupper-router`, then `sync-site-kube`.

**Routes** (`/api/v1alpha1/`): backbone → `GET hostnames`; member → `GET site/status`, `PUT site/start`.

**Scripts** (`scripts/` → container `/usr/local/bin/`): `vmsstart`, `vmsstatus`, `vmshosts`.

## Testing

Package `"test"` is a stub — always run tests from the repo root.

Colocated unit tests: `src/*.test.js`.

- Pass `backboneMode` correctly in tests — it changes which routes and subsystems run.
- Helper: `src/test-helpers/build-site-api-app.js` — `buildSiteApiApp({ backboneMode, includeMemberApi })` mounts routes without binding a port.
- Route tests use **supertest** (`sc-apiserver.test.js`, `api-member.test.js`).
- Mock kube/AMQP at module boundaries for claim and sync tests.

Shared Vitest rules and layout: [docs/notes/testing.md](../../docs/notes/testing.md).

## Constraints

- SC communicates **in-band via the backbone** — member sites may lack direct TCP to MC.
- Preserve the **claim-redemption flow** in `claim.js` (configmap/secret → AMQP assert → member config).
- Do not move shared protocol/kube/AMQP helpers here — put them in `modules/`.
