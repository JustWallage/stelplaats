import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { WsEvent } from "../../shared/ws-events";
import { broadcast } from "../lib/broadcast";

const event: WsEvent = {
  type: "task_created",
  payload: {
    id: 1,
    title: "Water monstera",
    kind: "plants",
    type: "scheduled",
    location: "Living room",
    description: null,
    intervalDays: 3,
    dueDate: null,
    createdAt: "2026-06-12T10:00:00.000Z",
    archived: false,
    due: { status: "due", dueAt: "2026-06-12" },
    lastCompletion: null,
  },
};

async function connect(
  name: string,
): Promise<{ socket: WebSocket; messages: string[] }> {
  const stub = env.WEBSOCKET_DO.get(env.WEBSOCKET_DO.idFromName(name));
  const res = await stub.fetch("https://do/", {
    headers: { Upgrade: "websocket" },
  });
  expect(res.status).toBe(101);
  const socket = res.webSocket;
  if (socket === null) {
    throw new Error("Expected a WebSocket in the 101 response");
  }
  socket.accept();
  const messages: string[] = [];
  socket.addEventListener("message", (e) => {
    if (typeof e.data === "string") {
      messages.push(e.data);
    }
  });
  return { socket, messages };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("WebsocketDO", () => {
  it("delivers a broadcast to every connected socket", async () => {
    const a = await connect("global");
    const b = await connect("global");

    const stub = env.WEBSOCKET_DO.get(env.WEBSOCKET_DO.idFromName("global"));
    const res = await stub.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(200);
    await settle();

    expect(a.messages).toEqual([JSON.stringify(event)]);
    expect(b.messages).toEqual([JSON.stringify(event)]);
  });

  it("rejects non-upgrade, non-broadcast requests", async () => {
    const stub = env.WEBSOCKET_DO.get(env.WEBSOCKET_DO.idFromName("global"));
    const res = await stub.fetch("https://do/nonsense");
    expect(res.status).toBe(404);
  });
});

describe("broadcast()", () => {
  it("sends a validated event through the global DO instance", async () => {
    const a = await connect("global");
    await broadcast({ ...env, ENVIRONMENT: "local" }, event);
    await settle();
    expect(a.messages).toEqual([JSON.stringify(event)]);
  });
});
