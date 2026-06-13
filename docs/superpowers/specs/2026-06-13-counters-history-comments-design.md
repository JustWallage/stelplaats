# Counters with logging, history editing & comments

Date: 2026-06-13
Status: Approved

## Summary

The data model is already counter-based: `tasks` are recurring templates with an
`intervalDays` target, `completions` is a fact log of who did a task and when, and
due/overdue is computed from the latest completion. This work keeps that model and
adds the missing capabilities and UI:

- A completion modal ("I did this") with an optional note and an optional user
  override (Just / Suus, defaulting to the logged-in user).
- Optional `location` and a new `description` on tasks.
- Editable and deletable history records (who / when / note).
- A general comment thread per task (add + delete).
- An archived-tasks section per kind.
- A home screen that always shows all overdue tasks, filled to a minimum of three
  with the soonest-due, plus a separate section for ad-hoc tasks done longest ago.
- A new-task option to set a "last done" date, which seeds a first completion.
- A color gradient on each card from green (just done) through orange (~2 days
  before due) to red (at/after due), scaled to the task's interval.
- A third generic "house" task kind alongside cleaning and plants.
- Back buttons on task pages.

No fundamental data-model change; this is additive.

## Data model (`db/schema.ts`)

`tasks`:

- add `description text` (nullable).
- change `location` from `notNull` to nullable.
- extend `kind` enum to `["cleaning", "plants", "house"]` (text column, type-only —
  no SQL check constraint).

`completions`: unchanged shape (`id`, `taskId`, `doneBy`, `doneAt`, `note`).

`comments` (new):

- `id` integer pk autoincrement
- `taskId` integer not null, FK → `tasks.id`
- `author` text not null (email)
- `body` text not null
- `createdAt` integer timestamp not null

Migrations (generated via `pnpm migrate:gen`, reviewed, applied with
`pnpm migrate:local`):

1. ADD COLUMN `description` to `tasks` + create `comments` table.
2. Table rebuild to make `location` nullable.

(Drizzle-kit decides the exact split; the new `kind` value needs no migration.)

## Shared contracts (`shared/`)

### `shared/users.ts` (new)

```ts
export const KNOWN_USERS = [
  { email: "just@wallage.nl", name: "Just" },
  { email: "suusraedts2018@gmail.com", name: "Suus" },
] as const;
```

- `userEmailSchema` — `z.enum` of the two known emails.
- `displayName(email: string): string` — maps a known email to its name; falls
  back to the raw email for any unknown value (e.g. local dev / e2e users).

### `shared/api.ts`

- `taskKindSchema` gains `"house"`.
- `taskCreateSchema`: `location` becomes optional/nullable; add `description`
  (nullable, max 1000); add `lastDoneAt` (optional ISO date) — when present, the
  POST seeds a first completion at that date.
- `taskPatchSchema`: add `description` (nullable); `location` nullable.
- `taskWithStatusSchema`: add `description` (nullable); `location` nullable.
- `completeTaskSchema`: keep `note` (nullable); add optional `doneBy`
  (`userEmailSchema`) and optional `doneAt` (ISO datetime).
- `completionPatchSchema` (new): `doneBy?` (`userEmailSchema`), `doneAt?` (ISO
  datetime), `note?` (nullable string) — all optional.
- `commentSchema` (new): `id`, `taskId`, `author`, `body`, `createdAt` (ISO).
- `commentCreateSchema` (new): `body` (trimmed, 1..1000).
- `commentListSchema` (new): `{ comments: Comment[] }`.

`doneBy` on the default completion path (no override supplied) uses
`c.get("userEmail")` directly and is **not** validated against the known list, so
local/e2e users always work. Only an explicit override is validated.

### `shared/due.ts`

- Keep `computeDueState` unchanged.
- Add `dueColorHue(intervalDays: number | null, dueAt: string | null, now: Date): number | null`:
  - Returns `null` for ad-hoc tasks (no interval).
  - Let `N = intervalDays`, `daysUntilDue = dueDay - today` (negative when overdue).
  - `daysUntilDue >= N` → hue 120 (green, just done).
  - Interpolate hue 120 → 30 (orange) as `daysUntilDue` goes from `N` down to `2`.
  - Interpolate hue 30 → 0 (red) as `daysUntilDue` goes from `2` down to `0`.
  - `daysUntilDue <= 0` → hue 0 (red).
  - For short intervals (`N <= 2`) the green anchor is clamped so a just-done task
    starts within the orange→red band; this is acceptable and intentional.
  - Pure and unit-tested. The component renders `hsl(<hue> 80% 45%)`.

## API (`worker/routes/tasks.ts`, `worker/routes/comments.ts`)

- `GET /api/tasks` — active tasks (unchanged); now returns `description` and
  nullable `location`. Add `?archived=true` to return archived tasks instead.
- `POST /api/tasks` — handles `description`, optional `location`; if `lastDoneAt`
  is present, inserts a seed completion (`doneBy` = current user, `doneAt` =
  `lastDoneAt`, `note` = null) before computing due state. Broadcasts
  `task_created`.
- `PATCH /api/tasks/:id` — adds `description`; `location` nullable. Broadcasts
  `task_updated`.
- `POST /api/tasks/:id/complete` — accepts optional `doneBy` (validated ∈ known
  users) and `doneAt`; defaults to current user / now. Broadcasts `task_completed`.
- `GET /api/tasks/:id/completions` — unchanged (newest first).
- `PATCH /api/tasks/:id/completions/:cid` — edit `doneBy` / `doneAt` / `note`;
  recompute due state; broadcasts `task_updated`.
- `DELETE /api/tasks/:id/completions/:cid` — delete; recompute; broadcasts
  `task_updated`.
- `GET /api/tasks/:id/comments` — chronological (oldest first).
- `POST /api/tasks/:id/comments` — `author` = current user, `createdAt` = now;
  broadcasts `comment_created`.
- `DELETE /api/tasks/:id/comments/:cid` — delete; broadcasts `comment_deleted`.

## Realtime (`shared/ws-events.ts`, `worker/do/`, `worker/lib/broadcast.ts`)

Event union:

- `task_created` — `TaskWithStatus`.
- `task_updated` — `TaskWithStatus`. Fired on patch/archive **and** on completion
  edit/delete (due state changes).
- `task_completed` — `{ task, completion }`.
- `comment_created` — `Comment`.
- `comment_deleted` — `{ id, taskId }`.

Detail page refetches its completions on `task_*` events for its task id, and its
comments on `comment_*` events for its task id. List/home pages mutate the task
list on `task_*` events.

## Frontend (`src/`)

- **CompletionModal** (new): opened by a card's "Done" button and the detail
  page's "I did this". Fields: optional note, user picker (Just/Suus, default =
  current user). Submits `POST /complete`.
- **TaskForm**: add description textarea, make location optional, add optional
  "last done" date input (seeds first completion). Kind defaults to the current
  tab.
- **TaskDetailPage**: back button to the kind list; header with title, optional
  location, description, due badge/gradient, and an edit-task action; history as
  cards (each editable — who/when/note — and deletable); "I did this" button; a
  comment thread (chronological, add box + per-comment delete).
- **Dashboard**:
  - "Upcoming" — scheduled tasks (`intervalDays != null`): all overdue sorted
    most-overdue-first, filled to a minimum of three with soonest-due
    (`take max(0, 3 - overdueCount)` of the rest). If ≥3 overdue, show all overdue.
  - "Ad-hoc" — tasks with `intervalDays == null`: the three done longest ago
    (oldest `lastCompletion.doneAt` first; never-done first).
  - Both rendered as cards with the gradient color.
- **TaskCard**: relative last-done text, gradient-colored due indicator, "Done"
  button opening the CompletionModal, link to detail.
- **Layout**: third "House" tab → `/house` (kind `house`); icon distinct from the
  dashboard Home icon (e.g. Wrench). Back buttons on task pages.
- **Archived section**: collapsible at the bottom of each kind page, lazily
  fetching `?archived=true`, with an unarchive action (PATCH `archived: false`).

The home-screen selection is extracted to a pure helper (`src/lib/home.ts`) so it
can be unit-tested without rendering.

## Testing

Unit (`pnpm check`):

- `dueColorHue` — green/orange/red anchors and interpolation, ad-hoc returns null,
  short-interval clamp.
- Home-screen selection helper — overdue-always-shown, min-3 fill, ad-hoc ordering.
- `computeDueState` — unchanged behavior preserved.

E2E (`pnpm test:e2e`):

- Completion modal logs with default user, and with the Just/Suus override.
- Edit a history record's who / when / note; the change is reflected and due state
  recomputes.
- Delete a history record; due state recomputes.
- Add and delete a comment; author + timestamp shown.
- New task with a "last done" date seeds a first completion.
- Archived section lists archived tasks and unarchive restores them.
- Home screen sectioning: all overdue shown, min-3 fill, ad-hoc section ordering.
- House tab creates and lists a house task.
- Back buttons navigate from detail to the kind list.

## Out of scope

- Editing comments (add + delete only, per decision).
- Ownership restrictions on edit/delete (anyone may edit/delete any record or
  comment, per decision).
- Home Assistant tab (still a placeholder).
