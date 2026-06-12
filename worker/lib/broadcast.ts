import type { WsEvent } from "../../shared/ws-events";
import type { Bindings } from "../env";

// Stub — the real WebsocketDO broadcast lands with the realtime task.
export async function broadcast(
  _env: Bindings,
  _event: WsEvent,
): Promise<void> {
  // no-op
}
