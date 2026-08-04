# VMS management-controller

## Environment Variables

At startup, the process loads `.env` from the current working directory. Copy [`.env.example`](.env.example) to `.env` in this directory (`components/management-controller/`) and adjust values. Variables already set in the environment are not overwritten.

- PGHOST, PGDATABASE — PostgreSQL connection
- APP_USER_PASSWORD, APP_SYSTEM_PASSWORD — pool passwords for `app_user` / `app_system`
- VMS_STANDALONE_NAMESPACE — set for standalone (out-of-cluster) operation
- VMS_SESSION_SECRET — session signing (`mc-apiserver.js`)
- NODE_ENV - console serve strategy (static build vs live updates)
