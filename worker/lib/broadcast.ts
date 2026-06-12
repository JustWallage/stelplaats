import { wsEventSchema, type WsEvent } from "../../shared/ws-events";
import type { Bindings } from "../env";

/**
 * Pushes an event to every connected client via the global WebsocketDO
 * instance. Realtime is best-effort: a mutation must never fail because
 * broadcasting did, so errors are swallowed.
 */
export async function broadcast(env: Bindings, event: WsEvent): Promise<void> {
  const validated = wsEventSchema.parse(event);
  try {
    const stub = env.WEBSOCKET_DO.get(env.WEBSOCKET_DO.idFromName("global"));
    await stub.fetch("https://do/broadcast", {
      method: "POST",
      body: JSON.stringify(validated),
    });
  } catch {
    // Clients fall back to refetch-on-load; nothing to do here.
  }
}
