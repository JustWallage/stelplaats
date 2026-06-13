# shared/

Single source of truth for every type that crosses the worker/frontend
boundary. Change the schema here FIRST; both sides follow via `z.infer`.

- `api.ts` — request/response schemas. Worker validates requests and parses
  responses with these; frontend parses fetch results with the same objects.
- `ws-events.ts` — discriminated union of ALL realtime events. Adding an event
  type = add it here, broadcast it in the worker route, subscribe in the UI.
- `due.ts` — due-state computation. UTC calendar days, NOT 24h windows
  (completing at 23:59 with a 1-day interval = due again the next day).

No imports from worker/ or src/ — this folder must stay dependency-free
(zod only) since both tsconfig projects include it.
