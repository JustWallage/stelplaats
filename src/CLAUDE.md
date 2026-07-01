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
- `pages/TaskListPage.tsx` is the ONE list for every kind: it shows all active
  tasks and a `KindFilter` chip row (All/Cleaning/Plants/House, single-select)
  that narrows both the list and the archived section. There are no per-kind
  routes — `kind` is a task field chosen in `TaskForm` (Category selector), not a
  page. Creating from a filtered view seeds that kind via `defaultKind`.
- Main pages are a horizontal swipe pager: `components/SwipeDeck.tsx` renders
  Home/Tasks/Control/Settings as scroll-snap panels (CSS only, no gesture lib) and
  is the layout-route element for those four paths, so it stays mounted across
  them — swiping or tapping a tab just scrolls + `navigate()`s, never reloads.
  `panels` there is the source of order (must match `navItems`).
  GOTCHA: every panel stays mounted, so a task shows on BOTH the Tasks list and
  the dashboard at once — inactive panels are `inert` (out of the a11y tree, so
  `getByRole` is unambiguous) but their text is still in the DOM. Hass (iframe,
  full-bleed) and `tasks/:id` (drill-in) are NOT in the deck — normal routes.
- `pages/ControlPage.tsx` (the Control tab) is the home-automation hub: the
  temporary "All lights off" button (`POST /api/hass/scripts/all_lights_off/run`)
  plus an "Open Home Assistant" button that `navigate()`s to `/hass`. Hass is NOT
  a nav tab — it's only reachable from here. `pages/HassPage.tsx` is the full-bleed
  iframe (no chrome, to maximise the embed); the navbar still shows so tabs stay
  reachable, but since it's outside the deck there's no swipe. Leaving is via a
  navbar item or the platform/browser Back (react-router history), not an in-app
  button.
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
