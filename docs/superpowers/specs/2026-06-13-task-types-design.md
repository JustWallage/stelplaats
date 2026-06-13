# Task types: Scheduled / As needed / One-off

## Problem

Today a task's nature is implicit in `intervalDays`: a number means it recurs on a
schedule, `null` means "ad-hoc" (recurs, but no due date). There is no way to
express a **one-off** task — something done once and then gone — and the nature of
a task is never chosen explicitly, so the two existing behaviours are easy to
confuse.

We want three explicit, mutually-exclusive task types, chosen deliberately at
creation (nothing pre-selected — the user must pick one) and editable afterwards:

1. **Scheduled** — recurs on a fixed interval; an interval in days is required.
2. **As needed** — recurs, but with no schedule (the current "ad-hoc" behaviour).
3. **One-off** — done a single time, then automatically archived. May carry an
   optional target date.

## Why the type must be stored, not derived

An **As needed** task and a dateless **One-off** task are identical at the column
level — both have `intervalDays = null` and no date — yet they behave differently
(a one-off archives itself on completion and shows as an outstanding action; an
as-needed task recurs forever). The behaviour therefore cannot be derived from the
existing columns. The type is stored as an explicit enum, and the API contract
makes it impossible to omit.

## Data model (`db/schema.ts`)

Two **additive** columns on `tasks` (additive only — no FK-blocked table rebuild,
which D1 forbids):

```ts
type: text("type", { enum: ["scheduled", "as_needed", "one_off"] }).notNull(),
dueDate: integer("due_date", { mode: "timestamp" }), // one-off optional target; null otherwise
```

`intervalDays` stays as-is (used only by `scheduled`).

### Invariants (enforced at the API boundary, see below)

| type        | intervalDays | dueDate  | lastDoneAt seed | archives on completion |
| ----------- | ------------ | -------- | --------------- | ---------------------- |
| `scheduled` | 1–365 (req)  | null     | allowed         | no                     |
| `as_needed` | null         | null     | allowed         | no                     |
| `one_off`   | null         | optional | not allowed     | **yes**                |

### Migration

A generated additive migration adds both columns, then backfills existing rows:

```sql
ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'as_needed';
ALTER TABLE tasks ADD COLUMN due_date INTEGER;
UPDATE tasks SET type = 'scheduled' WHERE interval_days IS NOT NULL;
```

The `DEFAULT 'as_needed'` satisfies the NOT NULL constraint for the
`ALTER TABLE … ADD COLUMN` on existing rows; the application always supplies `type`
explicitly on insert, so the default is only a migration backfill device.

## Contracts (`shared/api.ts`)

### Create

`taskCreateSchema` becomes a **discriminated union on `type`**, so the type cannot
be omitted and each variant only permits its valid fields:

```ts
const taskBase = { title, kind, location, description }; // shared fields

scheduled: { type: "scheduled", intervalDays: 1..365, lastDoneAt: datetime|null, ...taskBase }
as_needed: { type: "as_needed", lastDoneAt: datetime|null, ...taskBase }
one_off:   { type: "one_off", dueDate: date|null, ...taskBase }   // no lastDoneAt
```

### Edit

`taskPatchSchema` becomes a **union** of two shapes so the existing archive toggle
keeps working untouched while full content edits (including type changes) are added:

```ts
taskPatchSchema = z.union([
  z.object({ archived: z.boolean() }), // archive / unarchive toggle (unchanged)
  taskEditSchema, // discriminated union on type + base fields
]);
```

`taskEditSchema` mirrors the create variants (title/location/description always
present, plus the type's conditional fields). It carries no `archived` field —
archiving stays an orthogonal operation.

### Response

`taskWithStatusSchema` gains `type` and `dueDate` (`z.iso.date().nullable()`).
`DueStatus` is unchanged (`adhoc | ok | due | overdue`).

## Due logic (`shared/due.ts`)

`computeDueState` is refactored to take a small typed input object (clearer than a
growing positional list) and branches on type:

- `as_needed` → `{ status: "adhoc", dueAt: null }` (unchanged behaviour).
- `scheduled` → existing interval logic (`lastDoneAt + intervalDays`).
- `one_off` **with** `dueDate` → `ok | due | overdue` computed from the target date
  vs today (a single-shot schedule; no `lastDoneAt` involved).
- `one_off` **without** `dueDate` → `{ status: "due", dueAt: null }` — an
  outstanding to-do with no deadline.

`dueColorHue`:

- `scheduled` → unchanged (ramp scaled to the interval).
- `one_off` with date → ramps over a fixed window (`ONE_OFF_RAMP_DAYS`, e.g. 14):
  green when far out, orange→red as the date nears/passes.
- `one_off` without date, and `as_needed` → `null` (no countdown bar).

## Dashboard (`shared/home.ts`)

- `selectUpcoming` includes **scheduled + one-off** tasks (both have a meaningful
  due state): overdue first, then soonest-due to top up to the minimum. Dateless
  one-offs sort last (after all dated entries) but still appear as outstanding.
- `selectAdhoc` is renamed `selectAsNeeded` and filters `type === "as_needed"`
  (the three done longest ago). `Dashboard.tsx` section heading becomes
  "As needed".

## Worker (`worker/routes/tasks.ts`)

- `POST /api/tasks` parses the union and maps `type`, `intervalDays`, `dueDate`.
  A `one_off` may not seed `lastDoneAt` (schema-enforced).
- `PATCH /api/tasks/:id`:
  - archive-toggle shape → unchanged.
  - content-edit shape → set `title`/`location`/`description` plus, per the chosen
    variant, set `intervalDays` and `dueDate` **explicitly**, nulling whatever the
    new type does not use (e.g. switching to `as_needed` nulls both; switching to
    `one_off` nulls `intervalDays` and sets `dueDate` to the provided value or
    null). This is what makes a type change safe.
- `POST /api/tasks/:id/complete` → after inserting the completion, if
  `task.type === "one_off"` set `archivedAt = now`. The broadcast `task_completed`
  payload reflects `archived: true`, so both clients drop it from the active list.
- Serializer (`worker/lib/serialize.ts`) emits `type` and `dueDate`.

## Frontend

### Shared task form

`TaskForm` is refactored so its fields are reused by a **Create** dialog and an
**Edit** dialog (avoids a jscpd duplication failure and keeps both forms identical):

- A **required** type selector (segmented control / radio cards) with **nothing
  pre-selected**; the submit button is disabled until a type is chosen.
- Conditional fields: `scheduled` → interval-days input (required, 1–365);
  `one_off` → optional target-date input; `as_needed` → none.
- `lastDoneAt` ("Last done") shown only for `scheduled` and `as_needed`.
- Create mode posts the create union; Edit mode is pre-filled from the task and
  PATCHes the edit union.

### Detail / cards

- The task detail page (`TaskDetailPage.tsx`) gets an **Edit** button opening the
  edit dialog.
- `TaskCard` and the detail subtitle show the type clearly: "every N days"
  (scheduled), "as needed" (as_needed), "one-off" — with "· by ‹date›" appended
  when a one-off has a target date.
- The completion modal, when the task is a one-off, notes that completing it will
  archive the task.

## Tests

### Unit

- `shared/due.test.ts` — one-off dated (ok/due/overdue), one-off dateless (`due`,
  `dueAt` null); `dueColorHue` for one-off dated/dateless.
- `shared/home.test.ts` — `selectUpcoming` includes one-offs (dateless sorts last);
  `selectAsNeeded` filters by type.
- `worker/routes/tasks.test.ts` — create each type; validation rejects bad combos
  (scheduled without interval, one_off with interval, as_needed with dueDate,
  missing type); **edit changes type across all transitions and clears the
  incompatible columns**; one-off auto-archives on completion.

### E2E

- The create dialog's type selector is required (submit disabled until chosen).
- Create a one-off with a target date → complete it → it appears in the archived
  section and leaves the active list.
- Open the edit dialog on a scheduled task, change it to one-off, save → it now
  renders as a one-off and its interval is gone.

## SPEC.md

`SPEC.md` (the authoritative design document) is updated to describe the three task
types, the new columns, the create/edit union contracts, and the one-off
auto-archive behaviour, as part of implementation.

## Out of scope

- No bulk type migration UI; existing tasks are backfilled by the migration only.
- No new task `kind` (cleaning/plants/house unchanged).
