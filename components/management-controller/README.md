# Skupper-X management-controller

## Environment Variables

At startup, the process loads the first `.env` file found by walking up from the current working directory (via `@skupperx/modules/load-env`). Copy `.env.example` from the repository root to `.env` and adjust values. Variables already set in the environment are not overwritten.

- PGHOST, PGDATABASE — PostgreSQL connection
- APP_USER_PASSWORD, APP_SYSTEM_PASSWORD — pool passwords for `app_user` / `app_system`
- SKX_STANDALONE_NAMESPACE — set for standalone (out-of-cluster) operation
- VMS_SESSION_SECRET — session signing (`mc-apiserver.js`)
