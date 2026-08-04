# Console — Agent Guide

React UI for SkupperVMS: backbones, VANs, TLS, and site deployment. In production it is **served by the management controller**, not a standalone backend.

Workspace package name is **`vms-console`**; directory is `components/console`.

## Scope

Edit this package for UI pages, Carbon components, routing, and client-side API calls. Backend logic, auth, and APIs stay in the [management controller](../management-controller/AGENTS.md).

## Commands

```bash
# From repo root
pnpm --filter vms-console run build   # Vite → components/console/dist/

# API-integrated local UI
cd components/management-controller
node index.js                         # MC hosts API + console (port 8085)
```

**Do not** use isolated `pnpm --filter vms-console run dev` for API-integrated work — that Vite server has no MC backend, so the UI appears broken.

## Conventions

- **Stack:** React 19, React Router 7, Vite 8, IBM Carbon (`@carbon/react`), Sass.
- **New pages:** add under `src/pages/`, register route in `src/App.jsx`, add nav link in `src/components/Navigation/Navigation.jsx`.
- Follow Carbon patterns; keep UI thin — call MC APIs (`/api/v1alpha1/`), no business logic in the console.
- Build output is `dist/` (Vite `outDir`); MC serves it when `NODE_ENV=production`.

## Testing

`App.test.jsx` exists but is **not** in the Vitest `unit` project. Exercise the UI via MC-hosted local run (`node index.js` in management-controller).

## Constraints

- No backend or domain orchestration in the UI — use MC APIs.
- For HMR / live reload, run MC with `NODE_ENV` ≠ `production` (ViteExpress inside the controller). Rebuild `dist/` before production-mode MC.
