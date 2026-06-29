# worker/

## Bindings (wrangler.jsonc → `pnpm cf-typegen` → global `Env`)

| Binding                                                  | Type         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`                                                     | D1           | query via `getDb(c.env)` (Drizzle), never raw `env.DB` in routes                                                                                                                                                                                                                                                                                                                                                                    |
| `WEBSOCKET_DO`                                           | DO namespace | single instance `idFromName("global")` — only `lib/broadcast.ts` and the `/api/ws` route touch it                                                                                                                                                                                                                                                                                                                                   |
| `ENVIRONMENT`                                            | var          | `local` / `e2e` / `production`; ANY other value must behave like production (fail closed)                                                                                                                                                                                                                                                                                                                                           |
| `DEV_USER_EMAIL`, `TEST_AUTH_TOKEN`                      | secrets      | `.dev.vars` locally; per-run secret on e2e workers                                                                                                                                                                                                                                                                                                                                                                                  |
| `APP_URL`, `TELEGRAM_BOT_USERNAME`                       | vars         | reminder footer link; bot `@username` (no `@`) for the `t.me` deep link — empty (`e2e`) → link-code `url` is null. Both widened to `string` in `env.ts`                                                                                                                                                                                                                                                                             |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`          | secrets      | prod-only; OPTIONAL on `Env` (declared in `env.ts`). Token presence flips `getTelegramClient` to the real Bot API client (else the no-op fake — so no message leaves the worker in e2e/local). The webhook secret gates `/telegram/webhook` (fail closed). The e2e env sets a FIXED `TELEGRAM_WEBHOOK_SECRET` var (`e2e-webhook-secret`) so the hermetic suite can drive the webhook; CI's ephemeral worker sed-replaces it per-run |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | secrets      | Web Push; OPTIONAL on `Env` (declared in `env.ts`). All three present → `getPushSender` is the real sender; otherwise the no-op fake (e2e/local), so nothing is delivered. The public key is served to the browser via `GET /api/push`. The e2e env sets a committed `VAPID_PUBLIC_KEY` **var** (no private key) so the Settings UI shows push as available                                                                         |

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
- `index.ts` default export is `{ fetch, scheduled }` (NOT the bare Hono app —
  the app is the named `app` export; tests import `{ app }`). Keep `WebsocketDO`
  exported alongside.

## Telegram + the reminder cron (`lib/telegram*.ts`, `routes/telegram*.ts`, `lib/scheduled.ts`)

- Connect flow mirrors project `news`: `POST /api/telegram/link-code` mints a
  one-time code (15-min expiry, captured chat label), the bot `/start <code>`
  webhook consumes it, `GET /api/telegram` reports status, and both
  `DELETE /api/telegram` (web) and `/disconnect` (bot) delete the user's row.
  There are NO per-user slots/timezone — the schedule is fixed (07:00 Amsterdam).
- The webhook `POST /telegram/webhook` lives OUTSIDE `/api` (Telegram presents no
  Access identity), is gated solely by `X-Telegram-Bot-Api-Secret-Token` vs
  `TELEGRAM_WEBHOOK_SECRET` (constant-time, fail closed), and is exposed past
  Cloudflare Access by a Terraform "bypass" app (see `iac/`). `/telegram/*` is in
  `run_worker_first`. Binding a chat already linked to a DIFFERENT account is
  refused (the unique `chat_id` index would otherwise 500 the webhook).
- ONE cron (`0 5,6 * * *`) → `runDueTaskReminders`. It acts ONLY on the tick
  whose Amsterdam-local hour is 7 (`isAmsterdamReminderHour`, the DST guard: CET
  fires at 06:00 UTC, CEST at 05:00 UTC) so the reminder lands at 07:00 local
  with a single daily send. Then `sendDueTaskReminders` sends to EVERY linked
  chat the active tasks whose countdown reached zero today (`loadTasksDueToday`:
  due state `"due"` AND a concrete `dueAt`, so adhoc/undated tasks and
  already-overdue ones are excluded). Nothing due → no message at all.
- `lib/tasks-query.ts` owns the tasks+latest-completion query shared by the task
  list route and the reminder; due-state still comes from `shared/due.ts`.

## Web Push (`lib/push*.ts`, `routes/push.ts`)

- `lib/push-crypto.ts` is the wire format: VAPID JWT signing (RFC 8292) +
  aes128gcm payload encryption (RFC 8291) with Web Crypto only. workerd quirks,
  all worked around WITHOUT `as`: ECDH derive needs `public` at runtime but the
  types want `$public` (pass a typed variable, never an inline literal);
  `generateKey`/`exportKey` return unions (narrowed by `generateKeyPair` /
  `exportRawKey`). Tested by verifying the JWT and decrypting the payload
  round-trip — the only sound offline check.
- `getPushSender(env)` → real sender when all VAPID\_\* are set, else a no-op fake
  (mirrors `getTelegramClient`). Subscriptions the push service reports gone
  (404/410) are pruned. `push-subscriptions.ts` owns the table queries.
- Triggers: the 07:00 cron sends ONE notification per due task to EVERY
  subscription (`sendDueTaskPushNotifications`, beside the Telegram message); the
  complete route notifies every subscription EXCEPT the actor
  (`notifyTaskCompleted`) — best-effort, like broadcast (never fails the write).
- Routes: `GET /api/push` (vapid key or null), `POST /api/push/{subscribe,
unsubscribe,test}`. The service worker (`public/sw.js`) shows the notification.

## Tests

vitest-pool-workers runs these in real workerd. Fresh isolated D1 per test
file; migrations are applied by `test-setup.ts` via the `TEST_MIGRATIONS`
binding injected in `vitest.workers.config.ts`. Call routes as
`app.request(path, init, { ...env, ENVIRONMENT: "local" })`.
