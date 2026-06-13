import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  commentListSchema,
  commentSchema,
  taskWithStatusSchema,
  type Comment,
} from "../../shared/api";
import app from "../index";

const localEnv = { ...env, ENVIRONMENT: "local" };

const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function createTaskId(): Promise<number> {
  const res = await app.request(
    "/api/tasks",
    jsonInit("POST", {
      title: "Water ficus",
      kind: "plants",
      location: null,
      description: null,
      intervalDays: 7,
      lastDoneAt: null,
    }),
    localEnv,
  );
  return taskWithStatusSchema.parse(await res.json()).id;
}

async function postComment(taskId: number, body: string): Promise<Comment> {
  const res = await app.request(
    `/api/tasks/${taskId}/comments`,
    jsonInit("POST", { body }),
    localEnv,
  );
  expect(res.status).toBe(201);
  return commentSchema.parse(await res.json());
}

describe("comments", () => {
  it("posts a comment attributed to the current user", async () => {
    const taskId = await createTaskId();
    const comment = await postComment(taskId, "leaves looked dry");
    expect(comment.author).toBe("just@wallage.nl");
    expect(comment.body).toBe("leaves looked dry");
    expect(comment.taskId).toBe(taskId);
  });

  it("lists comments oldest first", async () => {
    const taskId = await createTaskId();
    await postComment(taskId, "one");
    await postComment(taskId, "two");
    const res = await app.request(
      `/api/tasks/${taskId}/comments`,
      {},
      localEnv,
    );
    expect(res.status).toBe(200);
    const { comments } = commentListSchema.parse(await res.json());
    expect(comments.map((comment) => comment.body)).toEqual(["one", "two"]);
  });

  it("deletes a comment", async () => {
    const taskId = await createTaskId();
    const comment = await postComment(taskId, "remove me");
    const del = await app.request(
      `/api/tasks/${taskId}/comments/${comment.id}`,
      { method: "DELETE" },
      localEnv,
    );
    expect(del.status).toBe(200);
    const res = await app.request(
      `/api/tasks/${taskId}/comments`,
      {},
      localEnv,
    );
    expect(commentListSchema.parse(await res.json()).comments).toHaveLength(0);
  });

  it("404s posting to an unknown task", async () => {
    const res = await app.request(
      "/api/tasks/99999/comments",
      jsonInit("POST", { body: "hi" }),
      localEnv,
    );
    expect(res.status).toBe(404);
  });
});
