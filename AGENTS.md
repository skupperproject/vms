# SkupperVMS — Agent Guide

This file provides guidance to AI coding agents working in this repository.

## Project Overview

SkupperVMS is a multi-tenant Virtual Application Network (VAN) management system: a pnpm monorepo with shared modules, two controllers, a React console, and Helm-based deployment.

## Scope

This file contains repository-wide guidance.

When working in a subdirectory, also consult the nearest `AGENTS.md`, which contains package-specific instructions.

## Commands

**Prerequisites:** Node.js, pnpm. Optional for deploy: kubectl, Helm, Helmfile, Podman/Docker.

```bash
pnpm install                          # install all workspace packages
pnpm test:unit                        # run all colocated unit tests
pnpm test:integration:local           # spin up Kind cluster, run integration tests, tear down Kind cluster

# Console build
pnpm --filter vms-console run build
```

More test commands (watch, coverage, integration): [docs/notes/testing.md](docs/notes/testing.md). Use Kind/integration only when changing deploy, cross-component, or cluster-facing behavior — not for ordinary unit or controller edits.

**Container builds** ([Containerfile](Containerfile)):

```bash
docker build -f Containerfile --target vms-management-controller .
docker build -f Containerfile --target vms-site-controller .
```

## Conventions

- **pnpm only** — do not use npm or yarn; workspace packages link via `workspace:*`.
- **Apache 2.0 header** on new `.js` source files (see existing files for the standard block).
- **Respect package boundaries** — do not move controller-specific logic into modules/. Only helpers shared by MC and SC belong there (no Express, Postgres, OIDC, or UI).

## Collaboration

- **Prefer correctness over agreement** — evaluate proposed approaches critically. If a design, implementation, or assumption is flawed or there is a better alternative, explain the tradeoffs and recommend the better approach with supporting reasoning.

## Development guidelines

- **Task-scoped diffs only** — change only what the request requires. Do not refactor, reformat, rename, or “improve” nearby code in the same file unless that change is necessary for the task. Match surrounding code style.
- **Prefer existing patterns** — before introducing a new abstraction, helper, or dependency, look for an existing implementation in the same package and extend or reuse it when appropriate.
- **Manage dependencies with pnpm** — if the requested change requires adding, removing, or updating dependencies, use the appropriate pnpm command rather than editing package.json or pnpm-lock.yaml by hand. If the user has not asked you to install or modify dependencies, ask before running the command.
- **Preserve existing comments** — do not rewrite or delete comments for style or preference. Update a comment only when the code it describes has changed and the comment would otherwise be wrong or misleading (e.g. a function that used to add two values now adds three — update the comment to match). Do not expand, rephrase, or “improve” comments that remain accurate.
- **Comments are for readers, not the agent** — add a comment only when it documents a non-obvious invariant, constraint, or workaround that the code itself does not make clear. Do not narrate what the code does, explain why the agent made a change, or refer to the conversation, the user, or the PR.
    - Good: `// Claim cert is the only participant credential; do not add bearer auth here.`
    - Bad: `// Updated this to use the new helper` / `// Fixed per review feedback`
- **Never hand-edit generated files** — modify the source inputs instead. Generated files (such as pnpm-lock.yaml, dist/, and other build artifacts) may change only as the result of a user-requested command (for example, a build or install). When a generated file changes, state which command produced it.
- **Preserve file history whenever practical** — prefer the smallest change that achieves the goal, and preserve git history whenever possible. When moving or renaming a tracked file, use `git mv` (or an equivalent tracked rename); do not delete-and-recreate.
- **Update unit tests alongside code changes** — when changing source under `modules/` or the controllers, update the colocated `*.test.js`. When adding a new `.js` source file there, add a colocated `<name>.test.js` for exported behavior. Console is outside the Vitest unit project.
- **Lint/format** — when finished modifying or creating a file, run `pnpm exec eslint --fix`, then `pnpm exec prettier --write`, on the modified files. Do not reformat style outside these commands.

## Testing

Unit tests are colocated in `modules/`, `management-controller/`, and `site-controller/` (console excluded). Run `pnpm test:unit` before considering a task complete. Do not run Kind/integration unless the change is deploy- or cluster-facing. In these cases, confirm before running integration tests.

Vitest projects, mocks, helpers, and branch-diff script: [docs/notes/testing.md](docs/notes/testing.md).

## Constraints

- **Never commit secrets:** `.env`, `keycloak.json`, credentials, or tokens (all gitignored).
- **Preserve OIDC/session checks** and claim-redemption flow when touching auth or bootstrap paths.
- **DB schema changes** must update both MC code and [charts/helmfile/resources/db-setup.sql](charts/helmfile/resources/db-setup.sql).

## Sources of truth

Several `docs/notes/*` files describe historical designs and may be stale. When documentation conflicts with implementation, treat the code paths listed below as the source of truth.

| If you change…               | Look at…                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| DB schema / objects          | `charts/helmfile/resources/db-setup.sql` and MC code that queries it                              |
| Admin or user API            | MC `api-admin.js`, `api-user.js`, `mc-apiserver.js`                                               |
| Certificates / PKI           | MC `certs.js`, chart cert templates                                                               |
| Auth / OIDC                  | MC `auth/management-oidc.js`, [keycloak-setup.md](docs/notes/keycloak-setup.md)                   |
| Backbone site bootstrap YAML | MC `site-deployment-state.js`, `mc-apiserver.js` (`backbonesite/…`), console `SiteDeployment.jsx` |
| Member claim redemption      | SC `claim.js`                                                                                     |
| K8s object templates         | MC `resource-templates.js` only                                                                   |
| Helm deploy                  | [charts/helmfile/](charts/helmfile/), [charts/management-server/](charts/management-server/)      |
