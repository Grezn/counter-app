---
name: counter-app
description: Develop, debug, and operate the C:\docker-demo counter-app / MSP on-call dashboard. Use when working on this repository's Express routes, visitor stats, incident records, runbook data, Jira proxy, CWA/weather fallback proxy, Docker/AWS deployment scripts, or the project MCP server.
---

# Counter App

## Quick Start

Work from `C:\docker-demo`. Prefer the project MCP server when available:

```bash
npm run mcp:smoke
npm run mcp
```

Use `COUNTER_APP_BASE_URL` to point MCP tools at a running app; it defaults to `http://127.0.0.1:3000`.
Keep `MCP_ALLOW_WRITES` unset or `0` unless the user explicitly wants MCP to create or update incident records.

## Architecture

- `server.js` wires Express middleware, static files, request logging, routes, and graceful shutdown.
- `frontend/` is the Vue + Vite frontend; `src/components/` owns the dashboard shell pieces, with weather, visitor stats, and `IncidentPanel.vue` split into panel header, action toolbar, fields, quick intake, incident templates, phrase menus, notes timeline, checklist, handover summary panel, Jira status, incident history status, incident history focus chips, incident history list, duplicate incident status, next-check availability, handover readiness, summary badge, summary status, service detail fields, workflow, and history subcomponents. `src/composables/` owns app shell, local weather, visitor stats, quick intake, incident template selector state, phrase menu state, notes timeline state, Jira status state, incident history status state, incident history focus state, incident history list state, duplicate incident status state, next-check availability state, handover readiness state, summary badge state, summary status state, service detail visibility, handover summary mode, incident history view/filter state, runbooks, and links panel state. `npm run build` writes the production bundle to `frontend/dist`.
- `routes/counter.js` owns the home page, visitor tracking, heartbeat behavior, and Redis-to-memory degraded stats fallback.
- Incident record CRUD is served by the app API with Redis persistence, backend memory fallback when Redis is degraded, and frontend localStorage fallback when backend storage is unavailable.
- `routes/runbooks.js` serves `data/runbooks.json`; keep sensitive SOP content out of this file.
- `routes/jira.js` proxies Jira issue creation without exposing tokens to the browser.
- `routes/weather.js` proxies Central Weather Administration data and caches responses in process memory.
- `services/redis.js` centralizes Redis connection, retry, and reconnect behavior.
- `public/index.html` is only a build-missing fallback page; do not rebuild a second legacy UI there.
- `public/app.js` and `public/styles.css` are still used as the current interaction/style bridge loaded by the Vue shell through `frontend/src/legacyBridge.js`; app shell, weather, visitor stats, runbooks, quick intake, incident template selector state, phrase menu state, notes timeline state, Jira status state, incident history status state, incident history focus state, incident history list state, duplicate incident status state, next-check availability state, handover readiness state, summary badge state, summary status state, service detail visibility, handover summary mode, incident history view/filter state, links panel, and back-to-top behavior have moved into Vue.

## Development Rules

Read nearby code before changing behavior. Keep changes scoped to the feature and preserve the existing CommonJS Express app unless the task is specifically about MCP, which uses `mcp/server.mjs` as ESM.

Do not place secrets in frontend code, `data/runbooks.json`, README examples, or committed env files. Jira, AWS, and CWA credentials belong in environment variables, SSM Parameter Store, or Secrets Manager.

For incident changes, preserve the backend sanitization path in `routes/incidents.js`. If MCP needs to create or update incidents, route it through the existing app API instead of writing Redis directly.
Do not set `MCP_ALLOW_WRITES=1` for exploratory reads, smoke tests, or production-oriented checks.

For frontend changes, keep the first screen as the operational dashboard. Use compact controls, stable dimensions, and the existing light/dark theme conventions.

## Validation

Use the smallest checks that cover the change:

```bash
npm run mcp:smoke
npm start
```

When the app must be exercised end to end, run Redis/Valkey locally or through Docker Compose and check `/health`, `/ready`, `/whoami`, `/api/runbooks`, and the affected UI path.

## Deployment Context

GitHub Actions builds and pushes an image, then uses SSM to update the existing EC2 container. `/health` checks only Node liveness; `/ready` checks Redis and is the safer production health gate. ASG refresh fallback is intentionally off by default.
