---
name: counter-app
description: Develop, debug, and operate the C:\docker-demo counter-app / MSP on-call dashboard. Use when working on this repository's Express routes, Redis-backed counter and incident records, runbook data, Jira proxy, CWA weather proxy, Docker/AWS deployment scripts, or the project MCP server.
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
- `routes/counter.js` owns counter, visitor tracking, heartbeat, and reset token behavior.
- `routes/incidents.js` owns Redis-backed incident record CRUD.
- `routes/runbooks.js` serves `data/runbooks.json`; keep sensitive SOP content out of this file.
- `routes/jira.js` proxies Jira issue creation without exposing tokens to the browser.
- `routes/weather.js` proxies Central Weather Administration data and caches responses in process memory.
- `services/redis.js` centralizes Redis connection, retry, and reconnect behavior.
- `public/index.html`, `public/app.js`, and `public/styles.css` are the dashboard UI.

## Development Rules

Read nearby code before changing behavior. Keep changes scoped to the feature and preserve the existing CommonJS Express app unless the task is specifically about MCP, which uses `mcp/server.mjs` as ESM.

Do not place secrets in frontend code, `data/runbooks.json`, README examples, or committed env files. Jira, reset token, AWS, and CWA credentials belong in environment variables, SSM Parameter Store, or Secrets Manager.

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
