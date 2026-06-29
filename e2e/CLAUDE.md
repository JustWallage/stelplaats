# e2e/

`pnpm test:e2e` — single command; Playwright auto-starts an e2e-mode dev
server on port 5174 (`pnpm dev:e2e`, separate from `pnpm dev` on 5173) and
reuses it across runs. In CI, `BASE_URL` points at the ephemeral worker and no
server is started.

How auth works here: the server runs with `ENVIRONMENT=e2e`, so identity comes
from the `X-Test-User-Email` + `X-Test-Auth` headers, which the Playwright
config injects on every request (`e2eHeaders` in playwright.config.ts). Local
token default is `local-test-token` (matches `.dev.vars.example`); CI generates
a per-run token. Extra browser contexts must pass `extraHTTPHeaders: e2eHeaders`
themselves (see live-updates.spec.ts).

- Import `test`/`expect` from `./fixtures`, never `@playwright/test` directly —
  the fixture wipes the DB via `POST /api/test/reset` before each test (which
  clears the `telegram` table too, so a linked chat never leaks across tests).
- `telegram.spec.ts` drives the bot webhook directly (mint code → POST
  `/telegram/webhook` with the secret token) to link/unlink without a real
  Telegram round-trip; the secret is `E2E_WEBHOOK_SECRET` (per-run in CI, else
  the committed `e2e-webhook-secret`).
- Tests run with workers: 1 because they share one database. Don't parallelize.
- Run one spec: `pnpm test:e2e e2e/tasks.spec.ts`.
- WebSocket connections need no auth headers (`/api/ws` is auth-exempt).
