# db/

Drizzle schema + generated SQL migrations (applied by wrangler, NOT drizzle-kit).

Workflow for any schema change:

1. Edit `schema.ts`.
2. `pnpm migrate:gen` — drizzle-kit writes a new SQL file to `migrations/`.
3. Review the SQL, then `pnpm migrate:local`.
4. CI applies it remotely (`--remote --env e2e|production`) before deploys.

Rules:

- NEVER edit or delete an already-committed migration file; add a new one.
  Migrations must be additive (expand/contract) — prod applies them in order.
- The `meta/` folder is drizzle-kit's snapshot state — commit it, never edit it.
- Row types are inferred (`TaskRow`, `CompletionRow`); timestamps are stored as
  epoch integers via `{ mode: "timestamp" }` and surface as `Date` objects.
