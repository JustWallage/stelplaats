# worker/

## Bindings (wrangler.jsonc → `pnpm cf-typegen` → global `Env`)

| Binding                             | Type         | Notes                                                                                             |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `DB`                                | D1           | query via `getDb(c.env)` (Drizzle), never raw `env.DB` in routes                                  |
| `WEBSOCKET_DO`                      | DO namespace | single instance `idFromName("global")` — only `lib/broadcast.ts` and the `/api/ws` route touch it |
| `ENVIRONMENT`                       | var          | `local` / `e2e` / `production`; ANY other value must behave like production (fail closed)         |
| `DEV_USER_EMAIL`, `TEST_AUTH_TOKEN` | secrets      | `.dev.vars` locally; per-run secret on e2e workers                                                |

## Invariants

- Identity comes ONLY from `c.get("userEmail")` (set by `middleware/auth.ts`).
  Routes must never read auth headers. All identity/test logic stays in that
  one middleware file.
- Route registration order in `index.ts` is load-bearing: `/api/ws` is
  registered BEFORE the auth middleware (browsers can't send headers on WS
  upgrades). `worker/index.test.ts` pins this — don't reorder.
- `/api/test/*` is 404-guarded for anything that isn't exactly e2e/local.
- Mutating routes call `broadcast(c.env, event)` AFTER the DB write, with an
  event from `shared/ws-events.ts`. Broadcast failures must never fail the
  mutation (it swallows errors by design).
- Responses are built through `shared/api.ts` schema `.parse(...)` — that is
  the no-casts pattern for turning DB rows into API payloads (`lib/serialize.ts`).

## Tests

vitest-pool-workers runs these in real workerd. Fresh isolated D1 per test
file; migrations are applied by `test-setup.ts` via the `TEST_MIGRATIONS`
binding injected in `vitest.workers.config.ts`. Call routes as
`app.request(path, init, { ...env, ENVIRONMENT: "local" })`.
