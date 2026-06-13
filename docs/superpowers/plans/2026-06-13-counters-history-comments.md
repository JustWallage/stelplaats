# Counters with logging, history editing & comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing counter model into a richer one: log completions through a modal with an optional user override, edit/delete history, comment per task, add descriptions, a "house" kind, an archived section, a smarter home screen, and a due-countdown color gradient.

**Architecture:** Additive. `shared/` schemas change first (the contracts), then `db/schema.ts` + migrations, then worker routes/serialize, then the realtime event union, then the React UI. Pure logic (`dueColorHue`, home selection) lives in unit-tested helpers.

**Tech Stack:** Hono + Drizzle + D1 + Durable Object on Cloudflare Workers; React 19 + React Router 7 + Tailwind v4 + Base-UI shadcn; Zod contracts in `shared/`; Vitest (workers pool + jsdom) + Playwright.

Gate after every task: `pnpm check` green. Commit after each task.

---

## Task 1: Known users in `shared/`

**Files:**

- Create: `shared/users.ts`
- Test: `shared/users.test.ts`

- [ ] **Step 1: Write `shared/users.ts`**

```ts
import { z } from "zod";

export const KNOWN_USERS = [
  { email: "just@wallage.nl", name: "Just" },
  { email: "suusraedts2018@gmail.com", name: "Suus" },
] as const;

export const userEmailSchema = z.enum([
  "just@wallage.nl",
  "suusraedts2018@gmail.com",
]);

export function displayName(email: string): string {
  return KNOWN_USERS.find((u) => u.email === email)?.name ?? email;
}
```

- [ ] **Step 2: Test** `shared/users.test.ts`: `displayName("just@wallage.nl") === "Just"`, `displayName("suusraedts2018@gmail.com") === "Suus"`, `displayName("e2e@stelplaats.test") === "e2e@stelplaats.test"`.
- [ ] **Step 3:** `pnpm test:unit` green. Commit `feat(shared): known users + displayName`.

---

## Task 2: API contract changes (`shared/api.ts`)

**Files:** Modify `shared/api.ts`. Import `userEmailSchema` from `./users`.

- [ ] **Step 1: Edit schemas**

```ts
const taskKindSchema = z.enum(["cleaning", "plants", "house"]);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: taskKindSchema,
  location: z.string().trim().min(1).max(100).nullable(),
  description: z.string().trim().min(1).max(1000).nullable(),
  intervalDays: z.int().min(1).max(365).nullable(),
  lastDoneAt: z.iso.datetime().nullable(),
});

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  intervalDays: z.int().min(1).max(365).nullable().optional(),
  archived: z.boolean().optional(),
});

export const completeTaskSchema = z.object({
  note: z.string().trim().min(1).max(500).nullable(),
  doneBy: userEmailSchema.optional(),
  doneAt: z.iso.datetime().optional(),
});

export const completionPatchSchema = z.object({
  doneBy: userEmailSchema.optional(),
  doneAt: z.iso.datetime().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional(),
});
```

Update `taskWithStatusSchema`: `location: z.string().nullable()`, add `description: z.string().nullable()`.

Add comment schemas at the end:

```ts
export const commentSchema = z.object({
  id: z.int(),
  taskId: z.int(),
  author: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const commentListSchema = z.object({
  comments: z.array(commentSchema),
});
```

- [ ] **Step 2:** Types compile (`taskKindSchema` already exported as `TaskKind`). This breaks downstream files — fixed in later tasks. Commit at Task 3 boundary once `shared/` typechecks in isolation (`pnpm check:ts` may stay red until worker/src updated — commit anyway with shared+ws together).

---

## Task 3: WS event union (`shared/ws-events.ts`)

- [ ] **Step 1: Edit** — import `commentSchema`, add events:

```ts
import { commentSchema, completionSchema, taskWithStatusSchema } from "./api";

export const wsEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task_created"), payload: taskWithStatusSchema }),
  z.object({ type: z.literal("task_updated"), payload: taskWithStatusSchema }),
  z.object({
    type: z.literal("task_completed"),
    payload: z.object({
      task: taskWithStatusSchema,
      completion: completionSchema,
    }),
  }),
  z.object({ type: z.literal("comment_created"), payload: commentSchema }),
  z.object({
    type: z.literal("comment_deleted"),
    payload: z.object({ id: z.int(), taskId: z.int() }),
  }),
]);
```

- [ ] **Step 2:** Commit `feat(shared): kind=house, descriptions, comments, configurable completion, ws events` (Tasks 1–3 may be squashed if `pnpm check` is still red on worker/src — acceptable: this is a contract-first commit, the very next task makes the gate green).

> Pragmatic note for inline execution: keep `shared/` + `db/` + `worker/` changes in one working set and only run the full `pnpm check` after Task 6, since the pre-commit hook runs the whole gate. Stage commits so each commit's gate passes — i.e. land contracts + schema + routes together as one commit if needed.

---

## Task 4: `dueColorHue` (`shared/due.ts`)

**Files:** Modify `shared/due.ts`; test `shared/due.test.ts` (add cases — file already exists).

- [ ] **Step 1: Add function**

```ts
const MS_PER_DAY = 86_400_000; // already defined at top — reuse

export function dueColorHue(
  intervalDays: number | null,
  dueAt: string | null,
  now: Date,
): number | null {
  if (intervalDays === null || dueAt === null) {
    return null;
  }
  const today = Math.floor(now.getTime() / MS_PER_DAY);
  const dueDay = Math.floor(Date.parse(dueAt) / MS_PER_DAY);
  const daysUntilDue = dueDay - today;
  if (daysUntilDue <= 0) {
    return 0; // red
  }
  if (daysUntilDue >= intervalDays) {
    return 120; // green
  }
  if (daysUntilDue >= 2) {
    const t = (daysUntilDue - 2) / Math.max(intervalDays - 2, 1); // 0..1
    return 30 + t * 90; // orange(30) → green(120)
  }
  return (daysUntilDue / 2) * 30; // red(0) → orange(30)
}
```

- [ ] **Step 2: Tests** — done today (`dueAt = today + interval`) → 120; due today (`daysUntilDue 0`) → 0; overdue → 0; `daysUntilDue === 2` → 30; ad-hoc (`intervalDays null`) → null. Pick `now`/`dueAt` via fixed ISO dates.
- [ ] **Step 3:** `pnpm test:unit` green.

---

## Task 5: DB schema + migrations (`db/schema.ts`)

**Files:** Modify `db/schema.ts`; generate migration(s) under `db/migrations/`.

- [ ] **Step 1: Edit schema**

```ts
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["cleaning", "plants", "house"] }).notNull(),
  location: text("location"),
  description: text("description"),
  intervalDays: integer("interval_days"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type CompletionRow = typeof completions.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
```

- [ ] **Step 2:** `pnpm migrate:gen` → review generated SQL (expect: ADD COLUMN `description`, create `comments`, and a table rebuild to drop NOT NULL on `location`). `pnpm migrate:local`. Confirm `meta/` updated.
- [ ] **Step 3:** Commit will follow with Task 6 (routes depend on these types).

---

## Task 6: Worker serialize + task routes

**Files:** Modify `worker/lib/serialize.ts`, `worker/routes/tasks.ts`. Add cases in `worker/routes/tasks.test.ts`.

- [ ] **Step 1: `serialize.ts`** — pass `description` and (nullable) `location` through `toTaskWithStatus` (the schema now allows null).

- [ ] **Step 2: `tasks.ts` GET `/`** — support `?archived=true`:

```ts
const archived = c.req.query("archived") === "true";
const where = archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt);
```

(import `isNotNull` from drizzle-orm.) Use `where` in the `activeTasks` query.

- [ ] **Step 3: POST `/`** — handle `lastDoneAt` seed. After inserting the task, if `parsed.data.lastDoneAt !== null`, insert a completion `{ taskId: task.id, doneBy: c.get("userEmail"), doneAt: new Date(lastDoneAt), note: null }`, then compute payload with that completion as `lastCompletion`. The insert `values` must include `description` and `location` (drop `lastDoneAt` from the spread — destructure it out).

- [ ] **Step 4: PATCH `/:id`** — add `description` to the `updates` builder (mirror `location`).

- [ ] **Step 5: POST `/:id/complete`** — use overrides:

```ts
const { note, doneBy, doneAt } = data;
.values({
  taskId: existing.id,
  doneBy: doneBy ?? c.get("userEmail"),
  doneAt: doneAt === undefined ? new Date() : new Date(doneAt),
  note,
})
```

- [ ] **Step 6: PATCH `/:id/completions/:cid`** — new route. Parse `completionPatchSchema`; load task (404) and completion (must belong to task, else 404); build `updates` from `doneBy`/`doneAt`/`note`; update; recompute task from `findLastCompletion`; broadcast `task_updated`; return updated `TaskWithStatus`.

- [ ] **Step 7: DELETE `/:id/completions/:cid`** — new route. Load task + completion (404s); `db.delete(completions).where(eq(completions.id, cid))`; recompute; broadcast `task_updated`; return updated `TaskWithStatus`.

- [ ] **Step 8: Tests** in `tasks.test.ts`: create with `description`/null `location`/`lastDoneAt` (asserts seeded `lastCompletion` + `due.status === "ok"`); `?archived=true` lists only archived; complete with `doneBy` override → `lastCompletion.doneBy` is the override; complete with `doneAt` in the past → `due.status` reflects it; PATCH completion changes note/doneBy/doneAt and recomputes; DELETE completion removes it and recomputes to `due`; PATCH/DELETE 404 on unknown task or completion.

- [ ] **Step 9:** Adjust existing test `createTask`/`defaultTask` — add `description: null`, `location` stays a string, `lastDoneAt: null` so the body validates.

- [ ] **Step 10:** `pnpm check` green. Commit `feat(worker): descriptions, configurable & editable completions, archived listing`.

---

## Task 7: Comments route

**Files:** Create `worker/routes/comments.ts`; register in `worker/index.ts`; wipe comments in `worker/routes/test-reset.ts`; serialize helper `toComment` in `serialize.ts`; tests in new `worker/routes/comments.test.ts`.

- [ ] **Step 1: `toComment`** in `serialize.ts`:

```ts
export function toComment(row: CommentRow): Comment {
  return commentSchema.parse({
    id: row.id,
    taskId: row.taskId,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  });
}
```

- [ ] **Step 2: `comments.ts`** — `commentsRoutes = new Hono<AppEnv>()`. Mounted at `/api/tasks/:id/comments` (see Step 3). Routes:
  - `GET "/"` — list comments for `:id` ascending by `id` → `{ comments }`.
  - `POST "/"` — parse `commentCreateSchema`; insert `{ taskId, author: c.get("userEmail"), body, createdAt: new Date() }`; broadcast `comment_created`; return the `Comment` (201).
  - `DELETE "/:cid"` — delete; broadcast `comment_deleted` `{ id: cid, taskId }`; return `{ ok: true }`.

  `:id` is read with `c.req.param("id")`. To get `:id` from a sub-router mounted under `/api/tasks/:id/comments`, register it directly on `tasksRoutes` instead: add the three comment handlers to `tasks.ts` OR mount with full paths in `index.ts`. **Chosen approach:** add comment handlers onto `tasksRoutes` in a separate file by exporting a function `registerCommentRoutes(tasksRoutes)` — simplest is to define them inline in `comments.ts` as `tasksRoutes`-style and import into `tasks.ts`. To keep `tasks.ts` focused, define `commentsRoutes` and mount in `index.ts`: `app.route("/api/tasks/:id/comments", commentsRoutes)` — Hono exposes `:id` to the child via `c.req.param("id")`. Verify in the test.

- [ ] **Step 3: `index.ts`** — `app.route("/api/tasks/:id/comments", commentsRoutes)` registered AFTER `app.route("/api/tasks", tasksRoutes)`.

- [ ] **Step 4: `test-reset.ts`** — `await db.delete(comments)` before deleting tasks (FK order).

- [ ] **Step 5: Tests** `comments.test.ts`: post a comment → author is `just@wallage.nl`, body echoed; list returns it ascending; delete removes it; list empty.

- [ ] **Step 6:** `pnpm check` green. Commit `feat(worker): per-task comment thread`.

---

## Task 8: Frontend lib helpers + unit tests

**Files:** Modify `src/lib/format.ts` (add `formatRelative`), `src/lib/api.ts` (`jsonInit` accepts `DELETE`), create `src/lib/dueColor.ts`, create `src/lib/home.ts`; tests `src/lib/home.test.ts`, `src/lib/dueColor.test.ts`.

- [ ] **Step 1: `api.ts`** — widen `jsonInit` method union to `"POST" | "PATCH" | "DELETE"`; add a `delInit = (): RequestInit => ({ method: "DELETE" })` or allow `jsonInit("DELETE", undefined)` (skip body when undefined). Prefer: `export const delInit: RequestInit = { method: "DELETE" }`.

- [ ] **Step 2: `format.ts`** — add:

```ts
export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${String(days)} days ago`;
};
```

- [ ] **Step 3: `dueColor.ts`** — wrap `dueColorHue` into a CSS string:

```ts
import { dueColorHue } from "@shared/due";
import type { TaskWithStatus } from "@shared/api";

export function dueColor(
  task: TaskWithStatus,
  now: Date = new Date(),
): string | null {
  const hue = dueColorHue(task.intervalDays, task.due.dueAt, now);
  return hue === null ? null : `hsl(${String(Math.round(hue))} 80% 45%)`;
}
```

- [ ] **Step 4: `home.ts`** — pure selection:

```ts
import type { TaskWithStatus } from "@shared/api";

const MIN_UPCOMING = 3;

export function selectUpcoming(tasks: TaskWithStatus[]): TaskWithStatus[] {
  const scheduled = tasks.filter((t) => t.intervalDays !== null);
  const byDue = (a: TaskWithStatus, b: TaskWithStatus) =>
    (a.due.dueAt ?? "").localeCompare(b.due.dueAt ?? "");
  const overdue = scheduled
    .filter((t) => t.due.status === "overdue")
    .sort(byDue);
  const rest = scheduled.filter((t) => t.due.status !== "overdue").sort(byDue);
  const fill = Math.max(0, MIN_UPCOMING - overdue.length);
  return [...overdue, ...rest.slice(0, fill)];
}

export function selectAdhoc(tasks: TaskWithStatus[]): TaskWithStatus[] {
  return tasks
    .filter((t) => t.intervalDays === null)
    .sort((a, b) =>
      (a.lastCompletion?.doneAt ?? "").localeCompare(
        b.lastCompletion?.doneAt ?? "",
      ),
    )
    .slice(0, 3);
}
```

- [ ] **Step 5: Tests** `home.test.ts`: with 5 overdue → all 5 returned; with 2 overdue + 3 ok → 2 overdue + 1 soonest ok = 3, overdue first; with 0 overdue + 5 ok → 3 soonest; ad-hoc never-done sorts before done; ad-hoc limited to 3. `dueColor.test.ts`: ad-hoc → null; done-today → `hsl(120 …)`.
- [ ] **Step 6:** `pnpm test:unit` green. Commit `feat(src): home selection, due color, relative time helpers`.

---

## Task 9: CompletionModal component

**Files:** Create `src/components/CompletionModal.tsx`.

- [ ] **Step 1:** Dialog with: optional note `Textarea`, a user `<Select>` of `KNOWN_USERS` defaulting to `useUser()` if it is a known email (else default to first known user but pre-select nothing/override only when changed). Submit calls `completeTask(taskId, { note, doneBy })`. Update `completeTask` (in `TaskCard.tsx`, see Task 10) to accept an options object `{ note, doneBy?, doneAt? }`.
- [ ] **Step 2:** Props `{ taskId, title, open, onOpenChange, onDone }`. Trigger lives in the caller. Use Base-UI `Select` from `components/ui/select.tsx` (`render={...}` pattern).
- [ ] **Step 3:** No standalone unit test (covered by e2e Task 14). `pnpm check` green. Commit with Task 10.

---

## Task 10: TaskCard — gradient + modal

**Files:** Modify `src/components/TaskCard.tsx`.

- [ ] **Step 1:** Change `completeTask` signature to `(taskId, opts: { note: string | null; doneBy?: string; doneAt?: string })` posting `opts`.
- [ ] **Step 2:** The card "Complete" button opens `CompletionModal` (state `open`) instead of completing immediately. Keep `aria-label={`Complete ${task.title}`}` on the trigger.
- [ ] **Step 3:** Apply `dueColor(task)` as a left border / dot: e.g. wrap card with `style={{ borderLeftColor: color ?? undefined }}` and `className="border-l-4"` when color is non-null. Replace last-done text to use `formatRelative(task.lastCompletion.doneAt)` and `displayName`.
- [ ] **Step 4:** `pnpm check` green. Commit `feat(src): completion modal with user override + due gradient card`.

---

## Task 11: TaskForm — description, optional location, last-done

**Files:** Modify `src/components/TaskForm.tsx`.

- [ ] **Step 1:** Add `description` textarea (optional) and a `lastDone` date `<input type="date">` (optional). Remove `required` from location.
- [ ] **Step 2:** Submit body: `{ title, kind, location: location.trim() === "" ? null : location, description: description.trim() === "" ? null : description, intervalDays: interval, lastDoneAt: lastDone === "" ? null : new Date(lastDone + "T12:00:00Z").toISOString() }`.
- [ ] **Step 3:** Reset new fields on success. `pnpm check` green. Commit `feat(src): task form description, optional location, last-done seed`.

---

## Task 12: TaskDetailPage rebuild + HistoryCard + Comments

**Files:** Modify `src/pages/TaskDetailPage.tsx`; create `src/components/HistoryCard.tsx`, `src/components/CommentSection.tsx`.

- [ ] **Step 1: HistoryCard** — renders one completion as a `Card`: `displayName(doneBy)`, `formatDateTime(doneAt)`, note. Has Edit (opens a dialog with user `<Select>`, `datetime-local` input, note `Textarea`) → `PATCH /api/tasks/:id/completions/:cid` via `apiFetch(..., taskWithStatusSchema, jsonInit("PATCH", {...}))`; and Delete → `apiFetch(..., taskWithStatusSchema, delInit)`. Both call `onChanged`.
- [ ] **Step 2: CommentSection** — `useCachedFetch(`/api/tasks/${id}/comments`, commentListSchema)`; lists comments ascending (`displayName(author)` + `formatDateTime(createdAt)` + body); an add box (POST) and per-comment delete (DELETE). Subscribes via the page's refresh.
- [ ] **Step 3: TaskDetailPage** — add a back `Button` (`onClick={() => navigate(`/${task.kind}`)}` with a `ChevronLeft` icon) at top. Header shows title, optional location, description, due badge. Replace "Mark as done" card with an "I did this" button opening `CompletionModal`. Replace the history `<ul>` with `HistoryCard` list. Add `<CommentSection taskId={id} />`. Keep Archive button.
- [ ] **Step 4:** Extend `useTaskEvents` usage — the page's `refresh` already remutates tasks + history; add comment refetch. Update `useTaskEvents` to also fire on `comment_created`/`comment_deleted` (Task 13).
- [ ] **Step 5:** `pnpm check` green. Commit `feat(src): detail page with editable history, comments, back button`.

---

## Task 13: WebSocket subscription + Layout + routes

**Files:** Modify `src/context/WebSocketContext.tsx`, `src/components/Layout.tsx`, `src/App.tsx`, `src/pages/TaskListPage.tsx`, `src/pages/Dashboard.tsx`.

- [ ] **Step 1: WebSocketContext** — add `"comment_created"`, `"comment_deleted"` to the `types` array in `useTaskEvents` so the detail page revalidates comments on socket events.
- [ ] **Step 2: Layout** — add `{ to: "/house", label: "House", icon: Wrench }` (import `Wrench` from lucide-react) between plants and hass.
- [ ] **Step 3: App** — add `<Route path="house" element={<TaskListPage kind="house" />} />`.
- [ ] **Step 4: TaskListPage** — add `house: "House"` to `titles`; add a collapsible **Archived** section that lazily `useCachedFetch("/api/tasks?archived=true", taskListSchema)` filtered by kind, each with an Unarchive button (PATCH `archived: false`).
- [ ] **Step 5: Dashboard** — replace overdue/due filters with `selectUpcoming(data.tasks)` ("Upcoming" section) and `selectAdhoc(data.tasks)` ("Ad-hoc" section). Empty-state when both empty.
- [ ] **Step 6:** `pnpm check` green. Commit `feat(src): house tab, archived section, home sectioning, back nav`.

---

## Task 14: E2E coverage

**Files:** Modify `e2e/tasks.spec.ts` (update existing flows for the modal); create `e2e/counters.spec.ts`.

- [ ] **Step 1:** Update the existing "create, complete, inspect history, archive" test: completing now opens the modal — click the card complete button, then confirm in the modal ("Done"/"Log" button). Location field is no longer required.
- [ ] **Step 2:** New tests in `counters.spec.ts`:
  - Log with a user override (select Suus) → history shows "Suus".
  - Edit a history record's note → updated note visible; edit the user → name changes.
  - Delete a history record → it disappears and due flips back to "Due".
  - Add a comment → author + body visible; delete it → gone.
  - Create a task with a "last done" date → detail history shows a seeded completion.
  - Archived section: archive a task, expand Archived on its kind page, unarchive → back in the active list.
  - House tab: create + list a house task.
  - Back button on detail returns to the kind list.
- [ ] **Step 3:** `pnpm test:e2e` green. Commit `test(e2e): counters, comments, editing, archived, house`.

---

## Task 15: Final gate + docs

- [ ] **Step 1:** `pnpm check` and `pnpm test:e2e` both green.
- [ ] **Step 2:** Update `SPEC.md` data-model + features sections to mention descriptions, the `house` kind, comments, configurable/editable completions, and the home/gradient behavior (short edit, no history narration per repo rules).
- [ ] **Step 3:** Commit `docs: SPEC update for counters/comments`. Push branch, open PR.

---

## Self-review notes

- **Spec coverage:** modal+override (T9/T10/T14), optional location (T2/T5/T11), editable/deletable history (T6/T12/T14), comments add+delete (T2/T3/T7/T12/T14), archived section (T6/T13/T14), home min-3 + ad-hoc section (T8/T13/T14), last-done seed (T2/T6/T11/T14), gradient (T4/T8/T10), house kind (T2/T5/T13/T14), back buttons (T12/T13/T14). All mapped.
- **Type consistency:** `completeTask` options object is introduced in T9 and used in T10/T12; `jsonInit` DELETE/`delInit` in T8 used in T12; `displayName` (T1) used in T10/T12; `dueColor` (T8) used in T10.
- **Migration risk:** `location` NOT NULL → nullable forces a SQLite table rebuild; review the generated SQL preserves rows (low data volume, personal app).
- **Comments mount:** verify Hono passes `:id` from `app.route("/api/tasks/:id/comments", commentsRoutes)` to the child; if not, fall back to registering the three handlers on `tasksRoutes` with explicit paths.
