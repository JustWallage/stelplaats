# Stelplaats — Specification

A home-management webapp for two users: track when things were cleaned, when plants were watered, and (later) control the home via Home Assistant. Combines the proven patterns of `jaw-finance` (CI/CD, ephemeral E2E, Google login via Cloudflare Access) and `iglympics` (Durable Object WebSocket live updates), on Cloudflare's current recommended platform.

## 1. Scope

### v1 (this spec)

- Task tracking: define recurring household tasks (cleaning, plant watering), mark them done, see what's due/overdue, see history.
- Live updates: any mutation is broadcast over WebSocket so both users' screens stay in sync.
- Google login restricted to exactly `just@wallage.nl` and `suusraedts2018@gmail.com`.
- Home Assistant: **empty placeholder page only** (nav entry + "coming soon").
- Basic, mobile-first design that scales to a sensible desktop layout. No design polish.
- Full CI/CD with ephemeral E2E environments and gated production deploys.
- AI-development guardrails: maximal strictness, one-command checks, one-command E2E, lean CLAUDE.md files.

### Out of scope for v1

- Home Assistant integration (placeholder only), push notifications, PWA, design polish, TanStack Query. All are additive later; nothing in v1 blocks them.

## 2. Stack

| Layer                  | Choice                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform               | Cloudflare **Workers + static assets** (single worker, single `wrangler.jsonc`)                                                                                     |
| API                    | **Hono** (router + middleware) on the worker fetch handler                                                                                                          |
| Realtime               | **`WebsocketDO`** Durable Object, same worker, hibernation API                                                                                                      |
| Database               | **D1** + **Drizzle ORM** (`drizzle-kit generate` → SQL migrations → `wrangler d1 migrations apply`)                                                                 |
| Validation / contracts | **Zod** schemas in `shared/`, inferred types used by both frontend and worker                                                                                       |
| Frontend               | **React 19 + Vite 7** (official `@cloudflare/vite-plugin`), TypeScript strict, **Tailwind v4** (`@tailwindcss/vite`), **shadcn/ui**, **Lucide**, **React Router 7** |
| Data fetching          | Lightweight custom hooks (SWR-style cache + WebSocket-triggered revalidation, iglympics pattern)                                                                    |
| Auth                   | **Cloudflare Access** (Google IdP), allowlist in Terraform; identity resolved in a single Hono middleware                                                           |
| IaC                    | **Terraform** ~1.12, Cloudflare provider 5.x, state in R2                                                                                                           |
| CI/CD                  | GitHub Actions, trunk-based, reusable `workflow_call` jobs, ephemeral E2E (jaw-finance pattern)                                                                     |
| Unit tests             | **Vitest** + `@cloudflare/vitest-pool-workers` (worker code runs in real workerd)                                                                                   |
| E2E                    | **Playwright**, single command, auto-starts dev server                                                                                                              |
| Quality gates          | ESLint 9 (typescript-eslint strict-type-checked), Prettier, **knip**, **jscpd**, Husky pre-commit                                                                   |
| Tooling                | pnpm, Node 22, ESM                                                                                                                                                  |

Versions: latest stable at scaffold time; majors as listed above.

## 3. Domain & hosting

- **v1 production URL: `stelplaats.<account>.workers.dev`**, protected by Cloudflare Access (Access supports workers.dev hostnames).
- `stelplaats.just.wallage.nl` is **deferred**: the `just.wallage.nl` zone lives in Route53 (`../just-wallage-nl` repo) and Workers custom domains require the zone in Cloudflare (subdomain zones are Enterprise-only). **No change to `just-wallage-nl` is needed for v1.**
- The later move is documented in `docs/DOMAIN-MIGRATION.md`:
  1. Add `wallage.nl` as a (free-plan) zone in the Cloudflare account; import **all** existing DNS records (including the `finance`/`iglympics`/`contexts` CNAMEs, mail records, etc.).
  2. Dad switches the registrar nameservers for `wallage.nl` to Cloudflare.
  3. Flip the Terraform variable `custom_domain = "stelplaats.just.wallage.nl"` — this creates the Workers custom domain and switches the Access application hostname.
  4. Retire (or convert to the Cloudflare provider) the `just-wallage-nl` Route53 repo.

## 4. Repository structure

```
stelplaats/
├── CLAUDE.md                  # project structure + commands + hard rules (see §13)
├── SPEC.md                    # this document
├── package.json               # single package, no workspace
├── wrangler.jsonc             # worker config: main=worker/index.ts, assets=dist/, D1 + DO bindings, envs
├── vite.config.ts             # react + tailwind + cloudflare plugins
├── tsconfig.json              # base (shared strict flags); per-target configs below
├── tsconfig.app.json          # src/ + shared/ (DOM libs)
├── tsconfig.worker.json       # worker/ + shared/ + db/ (workers-types)
├── tsconfig.e2e.json          # e2e/
├── eslint.config.js           # flat config, see §12
├── .prettierrc / .prettierignore
├── knip.json
├── .jscpd.json
├── drizzle.config.ts
├── playwright.config.ts
├── .dev.vars.example          # local worker secrets template
├── .bootstrap.env.example     # bootstrap secrets template (real file gitignored)
├── scripts/
│   └── bootstrap.sh           # idempotent one-time cloud setup (§11)
├── docs/
│   ├── BOOTSTRAP.md           # manual one-time steps (§11)
│   └── DOMAIN-MIGRATION.md    # deferred DNS move (§3)
├── shared/                    # CLAUDE.md + zod schemas: API contracts, WS events. No runtime deps beyond zod.
├── src/                       # CLAUDE.md + React app (pages/, components/, hooks/, context/, lib/)
├── worker/                    # CLAUDE.md + Hono app
│   ├── index.ts               # composition root: env parsing, middleware, route registration, DO export
│   ├── middleware/auth.ts     # THE ONLY file with identity/test logic (§8)
│   ├── routes/                # tasks.ts, comments.ts, test-reset.ts
│   ├── do/WebsocketDO.ts      # §7
│   └── lib/
├── db/                        # CLAUDE.md + schema.ts (drizzle) + migrations/*.sql (generated)
├── e2e/                       # CLAUDE.md + Playwright specs + fixtures
├── iac/                       # CLAUDE.md + Terraform (§10)
└── .github/workflows/         # deploy.yml, branch-pipeline.yml, check-and-build.yml, ephemeral-e2e.yml
```

## 5. Data model (Drizzle schema, D1)

One unified model covers cleaning, plants and generic house tasks; `kind` keeps the UI views separate. Tasks are recurring counters, not one-off todos: completing one logs a `completions` row and the due state is recomputed from it.

```ts
// db/schema.ts
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(), // "Vacuum living room", "Water monstera"
  kind: text("kind", { enum: ["cleaning", "plants", "house"] }).notNull(),
  location: text("location").notNull(), // room / plant spot; "" = none
  description: text("description"), // optional how-to / notes
  intervalDays: integer("interval_days"), // null = ad-hoc, no due date
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export const completions = sqliteTable("completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  doneBy: text("done_by").notNull(), // user email; editable/overridable
  doneAt: integer("done_at", { mode: "timestamp" }).notNull(),
  note: text("note"),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  author: text("author").notNull(), // user email
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

- Row types are **inferred** (`typeof tasks.$inferSelect`) — never hand-written.
- `location` is NOT NULL in the DB; optional location is the empty-string sentinel, converted to `null` at the API boundary (avoids a D1-hostile table rebuild — `DROP TABLE` is blocked while FKs reference `tasks`, and `PRAGMA foreign_keys=OFF` is a no-op inside the migration transaction).
- Users (`doneBy`/`author`) are the two allow-listed emails, mapped to friendly names (Just / Suus) by `shared/users.ts`; the logger is overridable per completion and defaults to the current user.
- Due logic is computed, not stored: `due = lastDoneAt + intervalDays` (never done → due now). Overdue = due < now. Plain functions in `shared/due.ts` (status + a green→orange→red countdown hue), unit-tested.
- Migrations: `drizzle-kit generate` writes plain SQL to `db/migrations/`; applied with `wrangler d1 migrations apply` (local/remote). Migrations are additive (expand/contract), reviewed before commit.

## 6. API (Hono, `/api/*`)

All request/response bodies validated with Zod schemas from `shared/api.ts`; handlers use the inferred types.

| Route                                                 | Purpose                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                     | auth/liveness check (used by frontend AuthGate)                                                                                       |
| `GET /api/me`                                         | current user email                                                                                                                    |
| `GET /api/tasks`                                      | active tasks (or archived with `?archived=true`), each with `lastCompletion` and computed due state                                   |
| `POST /api/tasks`                                     | create task (optional `lastDoneAt` seeds a first completion)                                                                          |
| `PATCH /api/tasks/:id`                                | edit (title, location, description, interval) / archive                                                                               |
| `POST /api/tasks/:id/complete`                        | record completion (optional note, `doneBy`, `doneAt`)                                                                                 |
| `GET /api/tasks/:id/completions`                      | history, newest first                                                                                                                 |
| `PATCH`/`DELETE …/completions/:cid`                   | edit (who/when/note) or delete a history record; recomputes due state                                                                 |
| `GET`/`POST …/:id/comments`, `DELETE …/comments/:cid` | per-task comment thread (add + delete)                                                                                                |
| `GET /api/ws`                                         | WebSocket upgrade → forwarded to `WebsocketDO`                                                                                        |
| `POST /api/test/reset`                                | wipe + reseed DB. **Registered in the composition root only when `ENVIRONMENT !== "production"`** — the route does not exist in prod. |

Mutating handlers broadcast a WS event (fire-and-forget) after the DB write succeeds.

## 7. Realtime: `WebsocketDO`

iglympics pattern, renamed and co-located:

- Class `WebsocketDO` exported from the worker entry, declared in `wrangler.jsonc` (`new_sqlite_classes` migration). **No separate DO worker** — every deploy (prod and each ephemeral E2E worker) gets its own fully isolated DO namespace.
- Single instance via `idFromName("global")`.
- **Hibernation API**: `state.acceptWebSocket(server)` on upgrade; sessions restored from `state.getWebSockets()` in the constructor; `webSocketClose` prunes.
- Internal `POST /broadcast` on the DO, reachable only via the DO stub from worker code (never routed through Hono).
- Events are a Zod **discriminated union** in `shared/ws-events.ts`: `task_created`, `task_updated` (also fired on completion edit/delete, since due state shifts), `task_completed`, `comment_created`, `comment_deleted` — `{ type, payload }`. Adding an event type = one schema change, typed on both ends.
- Frontend: `WebSocketContext` with `subscribe(type, handler)`, 3s auto-reconnect, graceful degradation (app fully works without the socket; events just trigger `mutate()` revalidation).
- Auth note: `/api/ws` is exempt from the app-level auth middleware (browsers can't set custom headers on WebSocket upgrades). In production the Access cookie still gates it at the edge; the stream carries only task events.

## 8. Auth

**All identity logic lives in `worker/middleware/auth.ts`. Handlers only ever call `c.get("userEmail")`. No test code anywhere else.**

The middleware switches on `ENVIRONMENT` (a wrangler var: `"local" | "e2e" | "production"`; **unknown values are treated as `production`** — fail closed):

| ENVIRONMENT  | Identity source                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `production` | `Cf-Access-Authenticated-User-Email` header (set by Cloudflare Access; Access enforces login before the worker is reached, so the header can't be spoofed). Additionally re-checked against `ALLOWED_EMAILS` var — defense in depth. |
| `e2e`        | `X-Test-User-Email` header, accepted **only** when `X-Test-Auth` equals the `TEST_AUTH_TOKEN` secret (timing-safe compare). Missing/wrong → 401.                                                                                     |
| `local`      | `DEV_USER_EMAIL` from `.dev.vars`.                                                                                                                                                                                                   |

- Cloudflare Access app (Terraform): Google IdP, policy allowing exactly `just@wallage.nl` and `suusraedts2018@gmail.com`, hostname = workers.dev URL for now (custom domain after the DNS move).
- Ephemeral E2E workers are **not** behind Access; they rely on the `e2e` path above and a per-run random `TEST_AUTH_TOKEN`.
- The middleware is unit-tested in workerd (vitest-pool-workers), including the fail-closed cases — this is the security-critical file.
- Optional later hardening: verify the `Cf-Access-Jwt-Assertion` signature against the team's public keys. Not in v1.

## 9. Frontend

- **Pages**: Dashboard (Upcoming — every overdue task plus enough soonest-due to fill three — and Ad-hoc — the three done longest ago), Cleaning / Plants / House (kind-filtered lists with an archived section), Task detail (description, editable/deletable history cards, comment thread, "I did this" modal, back button), Home Assistant (placeholder), accessed via bottom tab bar on mobile / sidebar on desktop.
- **Completion** is confirmed through a modal (optional note, optional Just/Suus override defaulting to the current user); task cards headline the time-until-due countdown ("N days left" / "Due today" / "N days overdue" / "Ad-hoc") and carry a green→orange→red left-border gradient for the same.
- **Layout**: mobile-first as the design target, but **with Tailwind breakpoints** (unlike iglympics) so desktop gets a real layout (centered content column → multi-column dashboard at `lg:`).
- **Gating**: `AuthGate` (calls `/api/health`; on 401/redirect shows login) wrapping the router, iglympics-style contexts: `WebSocketContext`.
- **Data**: `useCachedFetch<T>(url)` (module-level cache, background revalidate, `mutate()`), WS subscriptions call `mutate()`. Components never `fetch` directly.
- **Design**: stock shadcn/ui components, default theme. Intentionally plain — design pass comes later and only touches `src/`.

## 10. Environments, IaC & deployment

Three environments, mirrored in `wrangler.jsonc` envs:

| Env        | Worker                                                    | D1                                                | Access                                 |
| ---------- | --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| local      | `vite dev` (workerd via CF Vite plugin, real local D1/DO) | `stelplaats-local` (local)                        | — (`DEV_USER_EMAIL`)                   |
| e2e        | `stelplaats-e2e-<run_id>` (deployed by CI, deleted after) | `stelplaats-e2e-<run_id>` (created/deleted by CI) | — (test header path)                   |
| production | `stelplaats`                                              | `stelplaats-prod`                                 | Access app (Google, 2-email allowlist) |

**Terraform (`iac/`)**, state in R2 bucket `stelplaats-tfstate`:

- `cloudflare_d1_database.prod`
- Zero Trust: Google IdP (from bootstrap-provided client id/secret) + Access application + allow policy (the two emails)
- `custom_domain` variable, default `null` → when set later, creates the Workers custom domain and updates the Access app hostname
- Outputs: prod D1 id (consumed by the deploy job for config templating)

The worker itself is created/updated by `wrangler deploy` (not Terraform). Ephemeral resources are pure CI (wrangler CLI), never in Terraform state.

### GitHub Actions (jaw-finance pattern)

Reusable jobs (`workflow_call`): **`check-and-build.yml`** (install → `pnpm check` → `pnpm build` → upload `dist/`) and **`ephemeral-e2e.yml`**:

1. Create D1 `stelplaats-e2e-<run_id>`; apply migrations remotely.
2. Template config (worker name, D1 id, `ENVIRONMENT=e2e`); set per-run `TEST_AUTH_TOKEN` secret.
3. `wrangler deploy` → `https://stelplaats-e2e-<run_id>.<account>.workers.dev`.
4. Playwright against that URL (`BASE_URL` env, `X-Test-*` headers via fixtures); report uploaded on failure.
5. **Always** (also on failure): delete the worker and the D1 database.

Callers:

- **`deploy.yml`** (push to `main`): check-and-build → terraform apply → ephemeral-e2e (skippable with `-skip-e2e` in the commit title) → **deploy-prod** (concurrency group `deploy-prod`, no cancel): apply migrations to `stelplaats-prod`, sync secrets, `wrangler deploy` the `stelplaats` worker.
- **`branch-pipeline.yml`** (push to non-main with `run-pipeline` in the commit title): check-and-build → ephemeral-e2e. No prod deploy.

GHA secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TEST_AUTH_TOKEN` (fallback; per-run override preferred).

## 11. Bootstrap (one-time)

**`docs/BOOTSTRAP.md`** lists the only manual steps:

1. Cloudflare dashboard: create an API token (Workers, D1, R2, Access permissions).
2. Cloudflare dashboard: create R2 S3 credentials for the Terraform state backend.
3. Google Cloud Console: create an OAuth client (for the Access Google IdP); redirect URI = the Zero Trust team callback.
4. Copy `.bootstrap.env.example` → `.bootstrap.env` (gitignored) and paste the values from 1–3.
5. `wrangler login`, `gh auth login`, then run `scripts/bootstrap.sh`.

**`scripts/bootstrap.sh`** (idempotent — safe to re-run):

- Creates the `stelplaats-tfstate` R2 bucket if missing.
- Pushes every GHA secret from `.bootstrap.env` via `gh secret set` (client-side encrypted; values never hit shell history or the repo).
- Creates the local D1 database and applies migrations; scaffolds `.dev.vars` from the example if missing.
- Prints a checklist of what it did/skipped.

## 12. AI guardrails & quality gates

### TypeScript (all tsconfigs share the base)

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`.

### ESLint (flat config, type-aware on all targets)

- Presets: `strict-type-checked` + `stylistic-type-checked`.
- **`@typescript-eslint/consistent-type-assertions`: `assertionStyle: "never"`** — `as` casts are forbidden. Single exception via `no-restricted-syntax` carve-out: `as const` is allowed.
- `@typescript-eslint/no-non-null-assertion`: error (no `!`).
- `no-console` in `src/` (worker may log).
- ESLint disable comments require a description (`--report-unused-disable-directives`, `eslint-comments/require-description`-style rule).

### Other gates

- **Prettier** (default config) — formatting is never reviewed by humans or AI.
- **knip** — unused files/exports/dependencies fail the build. This is the duplicate-type tripwire: a locally redefined type usually orphans the shared export.
- **jscpd** — copy-paste detection over `src/`, `worker/`, `shared/` with a sane token threshold; fails on new duplication.
- **Husky pre-commit** = `pnpm check`.

### Commands (package.json)

| Script                                    | Does                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                | Vite dev server with workerd (real D1/DO bindings), migrations applied first                                                                                                   |
| `pnpm build`                              | `tsc -b && vite build`                                                                                                                                                         |
| `pnpm check`                              | **the** gate: prettier check → eslint → tsc (app, worker, e2e) → knip → jscpd → terraform fmt/validate → `vitest run`                                                          |
| `pnpm fix`                                | prettier write + eslint --fix                                                                                                                                                  |
| `pnpm test:unit`                          | vitest (workerd pool for `worker/`, node for `shared/`)                                                                                                                        |
| `pnpm test:e2e`                           | Playwright; **`webServer` auto-starts `pnpm dev` if nothing is listening** (`reuseExistingServer: true`); CI sets `BASE_URL` to the ephemeral URL which disables the webServer |
| `pnpm migrate:local` / `pnpm migrate:gen` | apply local migrations / `drizzle-kit generate`                                                                                                                                |

## 13. CLAUDE.md convention

Every CLAUDE.md is **short** and contains only what an AI cannot cheaply discover by reading code — bindings, contracts, invariants, known failure modes. No restating of what the code says.

- **Root**: project structure (the tree from §4), the three commands that matter (`pnpm check`, `pnpm test:e2e`, `pnpm dev`), hard rules (no `as`, types live in `shared/` or are Drizzle-inferred, every change must pass `pnpm check` + relevant E2E), pointer to SPEC.md.
- **`worker/`**: env bindings table (`DB`, `WEBSOCKET_DO`, vars/secrets), the auth middleware contract ("identity ONLY via `c.get("userEmail")`; never read auth headers in routes"), broadcast-after-write convention, ENVIRONMENT semantics + fail-closed rule.
- **`shared/`**: "single source of truth for API + WS contracts; change schema here first, both sides follow from inference."
- **`db/`**: migration workflow (edit `schema.ts` → `pnpm migrate:gen` → review SQL → `pnpm migrate:local`), additive-only rule, "never edit applied migrations."
- **`e2e/`**: how auth fixtures work (test headers), how the dev server auto-start works, how to run one spec.
- **`src/`**: data-fetch convention (hooks only, `mutate()` + WS subscribe), mobile-first-with-breakpoints rule.
- **`iac/`**: what Terraform owns vs what wrangler/CI owns, state location, the `custom_domain` variable's purpose.
- **`.github/`**: pipeline shape, commit-message triggers (`run-pipeline`, `-skip-e2e`), secrets list.

## 14. Implementation order (high level)

1. Scaffold: Vite + React + CF Vite plugin + Hono + wrangler.jsonc + all strictness tooling; `pnpm check` green on hello-world.
2. Drizzle schema + migrations + `/api/tasks` CRUD + unit tests (workerd pool).
3. Auth middleware (all three env paths, fail-closed) + tests.
4. `WebsocketDO` + `/api/ws` + frontend WebSocketContext.
5. Frontend pages (Dashboard, Cleaning, Plants, Task detail, HASS placeholder).
6. Playwright E2E (auth fixture, task lifecycle, live-update smoke test) with auto-start webServer.
7. Terraform + bootstrap script + docs; first manual deploy.
8. GHA workflows; first green main pipeline → production on workers.dev.
9. CLAUDE.md files (written last, against the real codebase).
