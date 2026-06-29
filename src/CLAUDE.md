# src/

- Data fetching: components NEVER call `fetch`. Reads go through
  `useCachedFetch(path, schema)` (module-level cache + background revalidate);
  writes go through `apiFetch` from `lib/api.ts`. Everything is zod-parsed.
- Realtime: pages call `useTaskEvents(mutate)` — it subscribes to all task
  WS events and revalidates. The socket auto-reconnects; the app must remain
  fully functional without it.
- Layout: mobile-first (bottom tab bar) WITH desktop breakpoints (`lg:`
  sidebar). Unlike sibling project iglympics, breakpoints are allowed and
  expected here. Nav items live in `components/Layout.tsx` (`navItems`).
- `pages/TelegramPage.tsx` (the Telegram tab) reads `/api/telegram` status,
  POSTs `/api/telegram/link-code` to reveal a `/start <code>` connect code (+
  `t.me` deep link), POSTs `/api/telegram/test`, and `DELETE`s `/api/telegram`
  behind a `ConfirmDialog`. It is connection-only — the 07:00 reminder schedule
  is fixed server-side, so there is no times/timezone UI.
- `components/ui/` is shadcn-generated (Base UI primitives, NOT Radix —
  triggers use `render={<Button />}`, not `asChild`). It is exempt from lint
  and knip; regenerate via `pnpm dlx shadcn@latest add <name>`, don't hand-edit.
- Design is intentionally plain for now — a design pass comes later and should
  only touch this folder.
