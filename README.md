# Stelplaats

An actively-used home-management app for two people — track when household chores were done and plants were watered, see what's due or overdue, and watch both screens stay in sync live. It runs as a **single Cloudflare Worker** that serves a React SPA as static assets, a [Hono](https://hono.dev) API, and one [Durable Object](worker/do/WebsocketDO.ts) for realtime updates. It installs as a **PWA on Android** and sends notifications — Web Push and/or Telegram — when a task is due (07:00) and when the other person completes one.

The app is small and in daily use by its two users. What makes the repository worth a look is **how it's built** — and the thread that ties all of it together is a single design goal: make this a codebase that **AI coding agents can work in productively**.

> [`SPEC.md`](SPEC.md) is the authoritative design document, and every directory has its own short [`CLAUDE.md`](CLAUDE.md) — they cover every decision below in more depth.

---

## Built for AI-driven development

Most of this project was built with AI coding agents, and it was designed from the start to make that work well. The interesting consequence is that the things which make an agent fast, cheap, and rarely wrong are the same things that make a codebase healthy for humans — so optimizing for the agent produced strict validation, full local testability, and a self-serve cloud pipeline as side effects.

Two ideas do most of the work:

**Context lives next to the code, and only the context that's worth paying for.** There's a [`CLAUDE.md`](CLAUDE.md) at the root and one in every directory ([`shared/`](shared/CLAUDE.md), [`worker/`](worker/CLAUDE.md), [`db/`](db/CLAUDE.md), [`src/`](src/CLAUDE.md), [`e2e/`](e2e/CLAUDE.md), [`iac/`](iac/CLAUDE.md), [`.github/`](.github/CLAUDE.md)). Each holds _only_ what an agent can't cheaply discover by reading the code — the bindings, contracts, invariants, and known failure modes — and deliberately nothing that just restates what the code already says. An agent editing the Worker pays for the Worker's context, not the whole repo's. A good example of the kind of thing that earns its place: a [documented D1 quirk](db/CLAUDE.md) about why an "optional" column is modeled as `NOT NULL` with a sentinel rather than nullable — an expensive-to-rediscover fact that belongs in a context file and nowhere else.

**The feedback loop is unambiguous and one command long.** An agent never has to guess how to check its work, and the checks are strict enough that whole categories of mistake fail loudly and immediately. That's the rest of this README.

## Strict validation, one command

There is exactly one gate, and it is non-negotiable:

```bash
pnpm check
```

It runs format, lint, types, dead-code and copy-paste detection, Terraform validation, and the unit suite — in one go ([what it runs](package.json), [how it's configured](eslint.config.js)). It is wired up as the **pre-commit hook**, and CI runs the identical command, so local and remote can never disagree about what "passing" means.

The strictness is turned all the way up on purpose, because an agent will lean on every escape hatch you leave open:

- **TypeScript** runs in `strict` mode with the extra safety flags layered on top ([base config](tsconfig.json)), split across separate projects for the app, the Worker, and the E2E suite so each only sees the libs it should.
- **ESLint** is fully type-aware and **forbids `as` casts** entirely ([rules](eslint.config.js)) — you fix the _types_ instead, usually by parsing through a schema. That removes an agent's favorite way to lie to the type checker.
- **[Zod schemas in `shared/`](shared/) are the single source of truth** for every API body and WebSocket event; both the React app and the Worker consume the _inferred_ types, and database row types come from Drizzle inference. A type that crosses a boundary is never written twice. Dead-code detection doubles as the tripwire here: redefine a type locally and the now-orphaned shared export fails the build.

The payoff is that invalid states are often unrepresentable rather than merely discouraged. Task payloads, for instance, are [discriminated unions on the task type](shared/), so a combination like "a scheduled task with no interval" can't even be expressed.

## Everything runs and is tested locally

```bash
pnpm dev        # full stack on localhost, real local database + Durable Object
pnpm test:e2e   # Playwright; auto-starts its own dev server if none is running
pnpm test:unit  # Vitest
```

There's no mock layer to drift out of sync with production — which matters doubly for an agent, since it can actually exercise its changes against real bindings instead of reasoning blind:

- `pnpm dev` runs the Worker in **real `workerd`** (via the official Cloudflare Vite plugin) against a **real local D1 database** and a **real Durable Object**. What you develop against is what ships.
- **Unit tests run inside `workerd` too**, so the security-critical [auth middleware](worker/middleware/auth.ts) is tested in the actual runtime — including its fail-closed paths — not a Node.js approximation.
- **E2E is a single command.** Playwright [auto-starts a dev server](e2e/) if nothing is listening, so it works from a clean checkout with zero setup.

## Fully ephemeral E2E testing phase in the pipeline

Local checks aren't always enough, so any branch can be validated against **real Cloudflare infrastructure** without touching production — and without leaving anything behind. The trigger is a convention in the commit message, which means an agent can invoke it on its own.

Push to a branch with the [pipeline trigger](.github/CLAUDE.md) in the commit title and CI will:

1. Create a fresh, uniquely-named D1 database and apply migrations to it.
2. Deploy a one-off, isolated Worker to its own `workers.dev` URL.
3. Run the full Playwright suite against that live deployment.
4. **Always — even on failure — delete both the Worker and the database.**

Because the Durable Object is co-located in the same Worker, every ephemeral deploy gets its own fully isolated realtime namespace. The [exact same reusable job](.github/workflows/ephemeral-e2e.yml) gates every push to `main`, so production is only ever reached by code that has already passed E2E against real infrastructure. The whole pipeline is steered by [commit-message conventions](.github/CLAUDE.md) — the commit message _is_ the control surface.

---

## Architecture at a glance

- **One Worker, three concerns.** [`worker/index.ts`](worker/index.ts) is the composition root — it parses env, wires middleware, registers routes, and exports the Durable Object — and the same Worker serves the built SPA as static assets.
- **All identity logic in one file.** [`worker/middleware/auth.ts`](worker/middleware/auth.ts) is the only place that touches authentication; handlers just read the resolved user. It branches per environment (Cloudflare Access in production, a test-token path for E2E, a dev var locally) and **fails closed** — anything unrecognized is treated as production.
- **Realtime as a typed union.** Every mutation broadcasts a [typed event](shared/) through the [Durable Object](worker/do/WebsocketDO.ts) to all clients; adding an event is a single schema change, typed on both ends. The app degrades gracefully without the socket.
- **Computed, not stored, due dates.** Due state and its countdown are pure, unit-tested functions in [`shared/due.ts`](shared/due.ts) that branch on task type.
- **Installable PWA with two notification channels.** A [service worker](public/sw.js) + manifest make it installable on Android; the Worker speaks the Web Push protocol directly ([VAPID + aes128gcm via Web Crypto](worker/lib/push-crypto.ts), no Node deps) and also sends Telegram messages. A daily cron fires both at 07:00 Amsterdam; completing a task notifies the other user.

## Stack

| Layer     | Choice                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Platform  | Cloudflare Workers + static assets (single Worker)                         |
| API       | [Hono](https://hono.dev)                                                   |
| Realtime  | Durable Object (hibernation API)                                           |
| Database  | D1 + Drizzle ORM (generated SQL migrations)                                |
| Contracts | Zod schemas in `shared/`, inferred types on both sides                     |
| Frontend  | React 19 + Vite, TypeScript strict, Tailwind v4, shadcn/ui, React Router 7 |
| Auth      | Cloudflare Access (Google IdP)                                             |
| IaC       | Terraform (Cloudflare provider), state in R2                               |
| CI/CD     | GitHub Actions, trunk-based, reusable jobs, ephemeral E2E                  |
| Quality   | ESLint, Prettier, knip, jscpd, TypeScript, Husky pre-commit                |

## Local development

```bash
pnpm install
pnpm dev                 # full stack, real local database + Durable Object
pnpm check               # the gate (also the pre-commit hook)
pnpm test:e2e            # Playwright (auto-starts a dev server)
```

Feature work happens in an isolated git worktree (`pnpm worktree <branch-name>`). One-time cloud setup is an idempotent bootstrap — see [`docs/BOOTSTRAP.md`](docs/BOOTSTRAP.md).

## Repository layout

```
shared/    Zod schemas = the contracts (API bodies, WS events) + due-date logic
worker/    Hono app — index.ts is the composition root; routes/, middleware/, do/, lib/
src/       React SPA — pages/, components/, hooks/, context/, lib/
db/        Drizzle schema.ts + generated SQL migrations
e2e/       Playwright specs + fixtures
iac/       Terraform (D1, Cloudflare Access, deferred custom domain)
scripts/   bootstrap.sh (one-time cloud setup)
docs/      BOOTSTRAP.md, DOMAIN-MIGRATION.md
```
