# Stelplaats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement SPEC.md end-to-end: a Cloudflare Workers home-management app (tasks for cleaning/plants, live updates via WebsocketDO, Access auth) with full guardrail tooling, E2E, Terraform, bootstrap, and GHA pipelines.

**Architecture:** Single Worker serves the Vite-built React SPA as static assets and an `/api/*` Hono app; `WebsocketDO` (same worker) broadcasts mutation events to clients. D1 + Drizzle for data. Identity is resolved exclusively in one Hono middleware with env-switched sources (Access header / test header / dev var), fail-closed.

**Tech Stack:** TypeScript (max strict), React 19, Vite 7 + @cloudflare/vite-plugin, Hono, Drizzle + D1, Zod (shared contracts), Tailwind v4 + shadcn/ui, Vitest (+ vitest-pool-workers), Playwright, ESLint 9 strict-type-checked, Prettier, knip, jscpd, Husky, Terraform, GitHub Actions, pnpm, Node 22.

**Reference:** `/Users/just/Documents/code-personal/stelplaats/SPEC.md` is authoritative. Sibling repos `../jaw-finance` (GHA/ephemeral patterns) and `../iglympics` (DO/WS patterns) are reference implementations.

**Conventions for every task:** after each task run `pnpm check` (once it exists) and commit with a conventional message. No `as` casts anywhere (only `as const`). All cross-boundary types come from `shared/` or Drizzle inference.

---

### Task 1: Git init + scaffold (Vite + React + CF plugin + Hono hello world)

**Files:** `package.json`, `pnpm-workspace.yaml` (none — single package), `.gitignore`, `.nvmrc` (22), `wrangler.jsonc`, `vite.config.ts`, `index.html`, `tsconfig.json` + `tsconfig.app.json` + `tsconfig.worker.json` + `tsconfig.e2e.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `worker/index.ts`, `worker/env.ts`, `shared/` (empty placeholder ok to omit until Task 3).

- [x] Step 1: `git init`, write `.gitignore` (node_modules, dist, .wrangler, .dev.vars, .env*, .bootstrap.env, playwright-report, test-results, iac/.terraform*, *.tfstate*).
- [x] Step 2: `pnpm init`; install deps: `react react-dom hono zod drizzle-orm` ; dev: `typescript vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler @cloudflare/workers-types tailwindcss @tailwindcss/vite drizzle-kit` (latest; record actual versions).
- [x] Step 3: `wrangler.jsonc` per SPEC §10: name `stelplaats`, `main: worker/index.ts`, D1 binding `DB` (`stelplaats-local`, `migrations_dir: db/migrations`), DO binding `WEBSOCKET_DO`→`WebsocketDO` + `new_sqlite_classes` migration, vars `ENVIRONMENT=local`, `ALLOWED_EMAILS`, assets with `not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`; envs `e2e` and `production` overriding ENVIRONMENT/db name (ids templated in CI).
- [x] Step 4: `vite.config.ts` with `react()`, `tailwindcss()`, `cloudflare()`. `index.html` → `src/main.tsx` rendering `<App/>` with Tailwind import in `src/index.css`.
- [x] Step 5: `worker/index.ts`: Hono app, `GET /api/health` returning `{ ok: true }`, export default fetch + export `WebsocketDO` stub class (empty for now), `worker/env.ts` typing bindings.
- [x] Step 6: Verify `pnpm dev` serves the React page and `/api/health` JSON. `pnpm build` succeeds.
- [x] Step 7: Commit `feat: scaffold workers + vite + hono hello world`.

### Task 2: Guardrail tooling — `pnpm check` green

**Files:** `eslint.config.js`, `.prettierrc`, `.prettierignore`, `knip.json`, `.jscpd.json`, `.husky/pre-commit`, `package.json` scripts, `vitest.config.ts`.

- [x] Step 1: Install dev deps: `eslint typescript-eslint @eslint/js prettier knip jscpd husky vitest @cloudflare/vitest-pool-workers eslint-plugin-react-hooks globals`.
- [x] Step 2: `eslint.config.js`: typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` with `projectService`; rules: `consistent-type-assertions: { assertionStyle: "never" }`; `no-restricted-syntax` carve-out NOT needed if assertionStyle never blocks as const → instead use `assertionStyle: "never"` + allow `as const` via rule option not available → use selector approach: disable the rule and add `no-restricted-syntax` with `TSAsExpression:not([typeAnnotation.typeName.name="const"])` + `TSTypeAssertion`. Also `no-non-null-assertion: error`, `no-console` for `src/**`, react-hooks rules for `src/**`, `linterOptions.reportUnusedDisableDirectives: "error"`.
- [x] Step 3: Prettier defaults; `pnpm fix` = prettier write + eslint --fix.
- [x] Step 4: `knip.json` (entry: worker/index.ts, src/main.tsx, e2e/**, config files). `.jscpd.json`: paths src worker shared, min-tokens ~70, fail on duplication.
- [x] Step 5: Scripts per SPEC §12 table incl. `check` chain (prettier → eslint → tsc ×3 → knip → jscpd → tf fmt/validate [skip until iac exists; add in Task 10] → vitest run).
- [x] Step 6: Husky init; pre-commit = `pnpm check`. Run `pnpm check` → green. Commit `chore: strict lint/format/dead-code/dup gates`.

### Task 3: Shared contracts + due logic (TDD)

**Files:** `shared/api.ts`, `shared/ws-events.ts`, `shared/due.ts`, `shared/due.test.ts`.

- [x] Step 1: Write failing tests `shared/due.test.ts` (vitest, node env): adhoc (null interval) → `{status:"adhoc", dueAt:null}`; never done → `due` today; lastDone+interval in future → `ok`; dueAt is today → `due`; dueAt before today → `overdue`. Calendar-day semantics (UTC).
- [x] Step 2: Run, expect fail. Implement `computeDueState(intervalDays: number|null, lastDoneAt: Date|null, now: Date)`. Run, pass.
- [x] Step 3: `shared/api.ts`: zod schemas `taskKindSchema` (`cleaning|plants`), `taskCreateSchema` (title 1..200, kind, location 1..100, intervalDays int 1..365 nullable), `taskPatchSchema` (partial + `archived` bool), `completeSchema` ({note?}), response schemas `taskWithStatusSchema`, `completionSchema`, `meSchema`, `healthSchema`. Export inferred types.
- [x] Step 4: `shared/ws-events.ts`: zod discriminated union on `type`: `task_created|task_updated|task_completed`, payloads referencing api schemas; export `WsEvent` type + `wsEventSchema`.
- [x] Step 5: `pnpm check`; commit `feat(shared): api/ws contracts and due-state logic`.

### Task 4: Drizzle schema + migrations

**Files:** `db/schema.ts`, `drizzle.config.ts`, generated `db/migrations/0000_*.sql`.

- [x] Step 1: `db/schema.ts` exactly per SPEC §5 (tasks, completions). `drizzle.config.ts`: dialect sqlite, schema db/schema.ts, out db/migrations.
- [x] Step 2: `pnpm migrate:gen` → review SQL; `pnpm migrate:local` applies via wrangler. Commit `feat(db): tasks/completions schema + initial migration`.

### Task 5: Auth middleware (TDD, security-critical)

**Files:** `worker/middleware/auth.ts`, `worker/middleware/auth.test.ts`, `worker/env.ts`.

- [x] Step 1: Failing tests (vitest-pool-workers, real workerd): production env: header present+allowlisted → email set; header missing → 401; header present but NOT in ALLOWED_EMAILS → 403; **unknown ENVIRONMENT value behaves like production**. e2e env: valid X-Test-User-Email + correct X-Test-Auth → ok; wrong/missing token → 401; TEST_AUTH_TOKEN unset → 401 always. local env: DEV_USER_EMAIL used; unset → 500.
- [x] Step 2: Implement: Hono middleware; timing-safe token compare (SHA-256 both values then `crypto.subtle.timingSafeEqual`); sets `c.set("userEmail", email)`. Tests pass.
- [x] Step 3: Wire in `worker/index.ts` for `/api/*` except `/api/ws`. `pnpm check`; commit `feat(worker): fail-closed auth middleware`.

### Task 6: Tasks API (CRUD + complete + history) with workerd unit tests

**Files:** `worker/routes/tasks.ts`, `worker/routes/me.ts`, `worker/routes/health.ts`, `worker/lib/db.ts`, `worker/lib/broadcast.ts` (stub no-op until Task 7), `worker/routes/tasks.test.ts`.

- [x] Step 1: Failing tests against the Hono app with a real (miniflare) D1: create task → 201 + zod-valid body; list includes computed due state; patch title/archive; complete → completion row + task lastCompletion updates; history ordering; validation errors → 400 with zod issues.
- [x] Step 2: Implement routes using drizzle(env.DB); every response built through shared schemas (`schema.parse(...)` — no casts). Broadcast called after successful writes (no-op stub).
- [x] Step 3: `/api/me`, `/api/health` (auth'd; returns `{ok, email}`). Tests pass; `pnpm check`; commit `feat(api): tasks crud/complete/history`.

### Task 7: WebsocketDO + /api/ws + broadcast

**Files:** `worker/do/WebsocketDO.ts`, `worker/routes/ws.ts`, `worker/lib/broadcast.ts` (real), `src` side in Task 8.

- [x] Step 1: `WebsocketDO` per SPEC §7 (hibernation accept, constructor restore via `state.getWebSockets()`, `webSocketClose` prune, internal `POST /broadcast` → send to all, dead-socket pruning on send failure).
- [x] Step 2: `GET /api/ws` (exempt from auth): require Upgrade header else 426; forward to `idFromName("global")` stub.
- [x] Step 3: `broadcast(env, event: WsEvent)`: zod-parse then fire-and-forget `stub.fetch("https://do/broadcast", {method:"POST", body})` via `c.executionCtx.waitUntil`.
- [x] Step 4: Unit test DO broadcast path in pool-workers (connect two sockets via stub, POST broadcast, both receive). `pnpm check`; commit `feat(realtime): WebsocketDO and broadcast pipeline`.

### Task 8: Frontend

**Files:** `src/lib/fetcher.ts`, `src/hooks/useCachedFetch.ts`, `src/context/WebSocketContext.tsx`, `src/components/AuthGate.tsx`, `src/components/Layout.tsx` (bottom tabs mobile / sidebar `lg:`), `src/pages/{Dashboard,TaskList,TaskDetail,Hass}.tsx`, `src/components/{TaskCard,CompleteButton,TaskForm}.tsx`, shadcn/ui setup (`components.json`, `src/components/ui/*` via CLI), router in `src/App.tsx`.

- [x] Step 1: Tailwind v4 + shadcn init (default theme, Lucide); add button, card, input, select, textarea, badge, dialog.
- [x] Step 2: `useCachedFetch<T>(url, schema)` — module Map cache, background revalidate, zod-parse responses, `mutate()`; never `fetch` in components.
- [x] Step 3: `WebSocketContext` per iglympics pattern (subscribe by type, 3s reconnect, parse via `wsEventSchema`).
- [x] Step 4: `AuthGate` on `/api/health` (401/opaque-redirect → login screen w/ explanation; Access handles real login in prod).
- [x] Step 5: Routes: `/` Dashboard (due+overdue across kinds, one-tap complete), `/cleaning`, `/plants` (kind lists + add form), `/tasks/:id` (history, edit, archive), `/hass` placeholder. WS events → `mutate()`.
- [x] Step 6: Manual verify via `pnpm dev`. `pnpm check`; commit `feat(ui): pages, live updates, mobile-first layout`.

### Task 9: test-reset route + Playwright E2E

**Files:** `worker/routes/test-reset.ts` (registered in `worker/index.ts` only when `ENVIRONMENT !== "production"`), `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/tasks.spec.ts`, `e2e/live-updates.spec.ts`, `package.json` (`dev:e2e`, `test:e2e`).

- [x] Step 1: Reset route: delete completions+tasks (runs through normal auth middleware → needs test/dev identity).
- [x] Step 2: `playwright.config.ts`: `baseURL = process.env.BASE_URL ?? "http://localhost:5173"`; `webServer` only when no BASE_URL: command `pnpm dev:e2e` (vite with `CLOUDFLARE_ENV=e2e`), `reuseExistingServer: true`; fixtures set `X-Test-User-Email`/`X-Test-Auth` via `extraHTTPHeaders` and call reset before each test.
- [x] Step 3: `tasks.spec.ts`: create task via UI → appears; complete → moves out of due list; history shows entry+author; archive hides. `live-updates.spec.ts`: two browser contexts; complete in A → B's dashboard updates without reload.
- [x] Step 4: One command `pnpm test:e2e` from cold (no server running) passes. Commit `feat(e2e): playwright with auto-start dev server`.

### Task 10: Terraform + bootstrap + docs

**Files:** `iac/main.tf`, `iac/variables.tf` (`custom_domain` default null), `iac/outputs.tf`, `scripts/bootstrap.sh`, `.bootstrap.env.example`, `docs/BOOTSTRAP.md`, `docs/DOMAIN-MIGRATION.md`; add `check:tf` into `pnpm check`.

- [x] Step 1: Terraform per SPEC §10: provider cloudflare ~>5, backend s3 (R2, bucket `stelplaats-tfstate`); resources: D1 prod, Access IdP (Google), Access app (domain = `stelplaats.<account>.workers.dev` or `var.custom_domain`), Access policy (two emails); workers custom domain resource `count = var.custom_domain == null ? 0 : 1`. Outputs: prod D1 id.
- [x] Step 2: `bootstrap.sh` (idempotent, `set -euo pipefail`): checks wrangler/gh auth; creates R2 bucket if absent; `gh secret set` for each key in `.bootstrap.env`; creates local D1 + migrations; scaffolds `.dev.vars`; prints summary. Manual steps → `docs/BOOTSTRAP.md` per SPEC §11; `docs/DOMAIN-MIGRATION.md` per SPEC §3.
- [x] Step 3: `terraform fmt/validate` wired into `pnpm check`. Commit `feat(infra): terraform, bootstrap, docs`.

### Task 11: GitHub Actions

**Files:** `.github/workflows/check-and-build.yml`, `ephemeral-e2e.yml` (workflow_call), `deploy.yml`, `branch-pipeline.yml`.

- [x] Step 1: `check-and-build.yml`: pnpm/Node 22 setup, terraform setup, `pnpm check`, `pnpm build`, upload `dist/`.
- [x] Step 2: `ephemeral-e2e.yml` per SPEC §10 list (create D1 `stelplaats-e2e-<run_id>` → migrate remote → template config (name/db-id/ENVIRONMENT=e2e) → set per-run TEST_AUTH_TOKEN → deploy → playwright vs URL → upload report on fail → ALWAYS delete worker + D1).
- [x] Step 3: `deploy.yml` (main): check-and-build → terraform apply → skip-check (`-skip-e2e`) → ephemeral-e2e → deploy-prod (concurrency `deploy-prod`, migrate prod, sync secrets, `wrangler deploy`). `branch-pipeline.yml`: trigger on `run-pipeline` commit-title token → check-and-build → ephemeral-e2e.
- [x] Step 4: `actionlint` if available; commit `ci: trunk pipeline with ephemeral e2e`.

### Task 12: CLAUDE.md files (last, against real code)

**Files:** `CLAUDE.md` (root), `worker/CLAUDE.md`, `shared/CLAUDE.md`, `db/CLAUDE.md`, `e2e/CLAUDE.md`, `src/CLAUDE.md`, `iac/CLAUDE.md`, `.github/CLAUDE.md`.

- [x] Step 1: Write each per SPEC §13 — short, only non-discoverable facts/invariants. Root includes the real tree + 3 commands + hard rules.
- [x] Step 2: Final full gate: `pnpm check` + `pnpm build` + `pnpm test:e2e` from cold. Commit `docs: CLAUDE.md guardrails`.

---

## Self-review

- Spec coverage: §1–§14 all mapped (scope→T1–9, stack→T1–2, domain→T10 docs, structure→T1, data→T4, api→T5–6/T9, DO→T7, auth→T5, FE→T8, envs/IaC/CI→T10–11, bootstrap→T10, guardrails→T2, CLAUDE.md→T12, order matches §14).
- Deliberate deviations: none.
- Out of scope, confirmed by user: hass logic, push, PWA, design polish, custom domain activation.
