import { DurableObject } from "cloudflare:workers";

/**
 * ALL realtime updates flow through this single Durable Object (one instance,
 * idFromName("global")). It only pushes server → client; clients never send.
 *
 * Uses the WebSocket hibernation API: connections are registered with
 * `ctx.acceptWebSocket` and enumerated with `ctx.getWebSockets()`, so they
 * survive the DO being evicted from memory between events.
 */
export class WebsocketDO extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          // Dead socket — hibernation API drops it on close/error.
        }
      }
      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }
}
