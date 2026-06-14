# Stelplaats

Home-management app (cleaning + plant tasks, live updates) for two users.
Single Cloudflare Worker serves the React SPA as static assets and the Hono
API; one Durable Object (`WebsocketDO`) carries ALL realtime updates.
[SPEC.md](SPEC.md) is the authoritative design document.

## Structure

```
shared/    Zod schemas = THE contracts (API bodies, WS events) + due-date logic
worker/    Hono app. index.ts is the composition root; routes/, middleware/, do/, lib/
src/       React SPA (pages/, components/, hooks/, context/, lib/)
db/        Drizzle schema.ts + generated SQL migrations
e2e/       Playwright specs + fixtures
iac/       Terraform (D1 prod, Cloudflare Access, deferred custom domain)
scripts/   bootstrap.sh (one-time cloud setup)
docs/      BOOTSTRAP.md (manual setup), DOMAIN-MIGRATION.md (deferred DNS move)
```

## Commands

- `pnpm check` — THE gate: format, lint, types, knip, jscpd, terraform, unit tests.
  Must pass before any commit (it is the pre-commit hook). Never bypass it.
- `pnpm test:e2e` — Playwright; auto-starts its own dev server (port 5174).
- `pnpm dev` — full-stack dev server (workerd with real D1/DO) on port 5173.

## Hard rules

- `as` casts are forbidden (ESLint enforces; only `as const` is allowed). Fix
  the types instead — usually by parsing with a schema from `shared/`.
- Types crossing a boundary live in `shared/` (z.infer) or come from Drizzle
  inference (`db/schema.ts`). Never redefine them locally.
- knip fails on unused exports/files/deps: don't export "for later".
- After changing `wrangler.jsonc`, run `pnpm cf-typegen` (also runs in check).
- Before implementing a new feature, create an isolated worktree with
  `pnpm worktree <branch-name>` (no `open` flag) and work there.
- Every change that includes logic => add relevant e2e tests
- Every change: `pnpm check` green + relevant e2e coverage.
- No comments unless absolutely necessary to understand non-obvious code, and
  then keep them short and inline. Never write comments that explain a change,
  restate what the code does, or narrate history — the diff and git do that.
- Keep [README.md](README.md) current for big changes only (new capabilities,
  shifts in architecture or workflow); skip it for small changes it never mentions.
