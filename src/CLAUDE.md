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
- `pages/SettingsPage.tsx` (the Settings tab) holds three cards: Install (replays
  the captured `beforeinstallprompt` from `lib/pwa.ts`), Notifications (Web Push
  for THIS device via `lib/push.ts` — reads `/api/push` for the VAPID key,
  enable/disable through the SW `PushManager`, `POST /api/push/test`), and
  Telegram (reads `/api/telegram`, mints a `/start <code>` link, test, disconnect
  behind a `ConfirmDialog`). Reminder timing is fixed server-side (07:00), so
  there is no schedule UI. The service worker (`public/sw.js`) handles `push` +
  `notificationclick`; it is a static asset, exempt from the app lint.
- `components/ui/` is shadcn-generated (Base UI primitives, NOT Radix —
  triggers use `render={<Button />}`, not `asChild`). It is exempt from lint
  and knip; regenerate via `pnpm dlx shadcn@latest add <name>`, don't hand-edit.
- Design is intentionally plain for now — a design pass comes later and should
  only touch this folder.
