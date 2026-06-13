import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  completionListSchema,
  taskListSchema,
  taskWithStatusSchema,
  type TaskWithStatus,
} from "../../shared/api";
import app from "../index";

// ENVIRONMENT=local → identity is DEV_USER_EMAIL (just@wallage.nl).
const localEnv = { ...env, ENVIRONMENT: "local" };

const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const defaultTask = {
  title: "Vacuum living room",
  kind: "cleaning",
  location: "Living room",
  description: null,
  intervalDays: 7,
  lastDoneAt: null,
};

async function createTask(
  overrides: Record<string, unknown> = {},
): Promise<TaskWithStatus> {
  const res = await app.request(
    "/api/tasks",
    jsonInit("POST", { ...defaultTask, ...overrides }),
    localEnv,
  );
  expect(res.status).toBe(201);
  return taskWithStatusSchema.parse(await res.json());
}

async function listTasks(): Promise<TaskWithStatus[]> {
  const res = await app.request("/api/tasks", {}, localEnv);
  expect(res.status).toBe(200);
  return taskListSchema.parse(await res.json()).tasks;
}

describe("POST /api/tasks", () => {
  it("creates a task that is due (never completed)", async () => {
    const task = await createTask();
    expect(task.title).toBe("Vacuum living room");
    expect(task.kind).toBe("cleaning");
    expect(task.intervalDays).toBe(7);
    expect(task.archived).toBe(false);
    expect(task.due.status).toBe("due");
    expect(task.lastCompletion).toBeNull();
  });

  it("creates an ad-hoc task without interval", async () => {
    const task = await createTask({ intervalDays: null });
    expect(task.due).toEqual({ status: "adhoc", dueAt: null });
  });

  it("creates a task with a null location and a description", async () => {
    const task = await createTask({
      location: null,
      description: "use vinegar",
    });
    expect(task.location).toBeNull();
    expect(task.description).toBe("use vinegar");
  });

  it("seeds a first completion when lastDoneAt is given", async () => {
    const lastDoneAt = new Date("2026-06-10T09:00:00Z").toISOString();
    const task = await createTask({ intervalDays: 7, lastDoneAt });
    expect(task.lastCompletion).not.toBeNull();
    expect(task.lastCompletion?.doneBy).toBe("just@wallage.nl");
    expect(task.due.status).toBe("ok");
  });

  it("rejects an invalid body", async () => {
    const res = await app.request(
      "/api/tasks",
      jsonInit("POST", { title: "", kind: "nonsense" }),
      localEnv,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body", async () => {
    const res = await app.request(
      "/api/tasks",
      { method: "POST", body: "not json" },
      localEnv,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks", () => {
  it("lists created tasks", async () => {
    const created = await createTask();
    const tasks = await listTasks();
    expect(tasks.map((t) => t.id)).toContain(created.id);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates the title", async () => {
    const created = await createTask();
    const res = await app.request(
      `/api/tasks/${created.id}`,
      jsonInit("PATCH", { title: "Vacuum bedroom" }),
      localEnv,
    );
    expect(res.status).toBe(200);
    expect(taskWithStatusSchema.parse(await res.json()).title).toBe(
      "Vacuum bedroom",
    );
  });

  it("archives a task, hiding it from the list", async () => {
    const created = await createTask();
    const res = await app.request(
      `/api/tasks/${created.id}`,
      jsonInit("PATCH", { archived: true }),
      localEnv,
    );
    expect(res.status).toBe(200);
    expect(taskWithStatusSchema.parse(await res.json()).archived).toBe(true);
    const tasks = await listTasks();
    expect(tasks.map((t) => t.id)).not.toContain(created.id);
  });

  it("404s on an unknown id", async () => {
    const res = await app.request(
      "/api/tasks/99999",
      jsonInit("PATCH", { title: "x" }),
      localEnv,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/complete", () => {
  it("records a completion and recomputes due state", async () => {
    const created = await createTask();
    const res = await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: "used the new vacuum" }),
      localEnv,
    );
    expect(res.status).toBe(200);
    const task = taskWithStatusSchema.parse(await res.json());
    expect(task.due.status).toBe("ok");
    expect(task.lastCompletion).not.toBeNull();
    expect(task.lastCompletion?.doneBy).toBe("just@wallage.nl");
    expect(task.lastCompletion?.note).toBe("used the new vacuum");
  });

  it("appears as lastCompletion in the list", async () => {
    const created = await createTask();
    await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: null }),
      localEnv,
    );
    const tasks = await listTasks();
    const listed = tasks.find((t) => t.id === created.id);
    expect(listed?.lastCompletion?.doneBy).toBe("just@wallage.nl");
    expect(listed?.due.status).toBe("ok");
  });

  it("404s on an unknown id", async () => {
    const res = await app.request(
      "/api/tasks/99999/complete",
      jsonInit("POST", { note: null }),
      localEnv,
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tasks/:id/completions", () => {
  it("returns history newest first", async () => {
    const created = await createTask();
    await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: "first" }),
      localEnv,
    );
    await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: "second" }),
      localEnv,
    );
    const res = await app.request(
      `/api/tasks/${created.id}/completions`,
      {},
      localEnv,
    );
    expect(res.status).toBe(200);
    const { completions } = completionListSchema.parse(await res.json());
    expect(completions).toHaveLength(2);
    expect(completions.map((completion) => completion.note)).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("POST /api/tasks/:id/complete overrides", () => {
  it("records a completion under an overridden user", async () => {
    const created = await createTask();
    const res = await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: null, doneBy: "suusraedts2018@gmail.com" }),
      localEnv,
    );
    expect(res.status).toBe(200);
    const task = taskWithStatusSchema.parse(await res.json());
    expect(task.lastCompletion?.doneBy).toBe("suusraedts2018@gmail.com");
  });

  it("rejects an unknown override user", async () => {
    const created = await createTask();
    const res = await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: null, doneBy: "stranger@example.com" }),
      localEnv,
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/tasks/:id/completions/:cid", () => {
  it("edits who, when and note, recomputing due state", async () => {
    const created = await createTask({ intervalDays: 7 });
    const completeRes = await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: "first" }),
      localEnv,
    );
    const completed = taskWithStatusSchema.parse(await completeRes.json());
    const cid = completed.lastCompletion?.id;
    const res = await app.request(
      `/api/tasks/${created.id}/completions/${cid}`,
      jsonInit("PATCH", {
        doneBy: "suusraedts2018@gmail.com",
        note: "corrected",
        doneAt: new Date("2026-01-01T00:00:00Z").toISOString(),
      }),
      localEnv,
    );
    expect(res.status).toBe(200);
    const task = taskWithStatusSchema.parse(await res.json());
    expect(task.lastCompletion?.doneBy).toBe("suusraedts2018@gmail.com");
    expect(task.lastCompletion?.note).toBe("corrected");
    expect(task.due.status).toBe("overdue");
  });

  it("404s on a completion that belongs to another task", async () => {
    const a = await createTask();
    const b = await createTask();
    const completeRes = await app.request(
      `/api/tasks/${a.id}/complete`,
      jsonInit("POST", { note: null }),
      localEnv,
    );
    const cid = taskWithStatusSchema.parse(await completeRes.json())
      .lastCompletion?.id;
    const res = await app.request(
      `/api/tasks/${b.id}/completions/${cid}`,
      jsonInit("PATCH", { note: "x" }),
      localEnv,
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id/completions/:cid", () => {
  it("deletes a completion and recomputes due state", async () => {
    const created = await createTask({ intervalDays: 7 });
    const completeRes = await app.request(
      `/api/tasks/${created.id}/complete`,
      jsonInit("POST", { note: null }),
      localEnv,
    );
    const cid = taskWithStatusSchema.parse(await completeRes.json())
      .lastCompletion?.id;
    const res = await app.request(
      `/api/tasks/${created.id}/completions/${cid}`,
      { method: "DELETE" },
      localEnv,
    );
    expect(res.status).toBe(200);
    const task = taskWithStatusSchema.parse(await res.json());
    expect(task.lastCompletion).toBeNull();
    expect(task.due.status).toBe("due");
  });
});

describe("GET /api/tasks?archived=true", () => {
  it("lists only archived tasks", async () => {
    const active = await createTask();
    const toArchive = await createTask();
    await app.request(
      `/api/tasks/${toArchive.id}`,
      jsonInit("PATCH", { archived: true }),
      localEnv,
    );
    const res = await app.request("/api/tasks?archived=true", {}, localEnv);
    expect(res.status).toBe(200);
    const ids = taskListSchema.parse(await res.json()).tasks.map((t) => t.id);
    expect(ids).toContain(toArchive.id);
    expect(ids).not.toContain(active.id);
  });
});

describe("GET /api/me", () => {
  it("returns the resolved identity", async () => {
    const res = await app.request("/api/me", {}, localEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "just@wallage.nl" });
  });
});
