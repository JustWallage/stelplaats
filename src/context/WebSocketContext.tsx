import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  wsEventSchema,
  type WsEvent,
  type WsEventType,
} from "@shared/ws-events";

type Handler = (event: WsEvent) => void;

interface WebSocketContextValue {
  subscribe: (type: WsEventType, handler: Handler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_DELAY_MS = 3000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef(new Map<WsEventType, Set<Handler>>());

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = wsEventSchema.safeParse(raw);
        if (!parsed.success) {
          return;
        }
        handlersRef.current.get(parsed.data.type)?.forEach((handler) => {
          handler(parsed.data);
        });
      };
      socket.onclose = () => {
        // Realtime is best-effort: keep retrying quietly; the app works
        // without it (data refetches on navigation).
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const subscribe = useCallback((type: WsEventType, handler: Handler) => {
    const handlers = handlersRef.current.get(type) ?? new Set<Handler>();
    handlers.add(handler);
    handlersRef.current.set(type, handlers);
    return () => {
      handlers.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

function useWebSocket(): WebSocketContextValue {
  const value = useContext(WebSocketContext);
  if (value === null) {
    throw new Error("useWebSocket must be used inside WebSocketProvider");
  }
  return value;
}

/** Subscribe to all task events — the standard "revalidate on change" hook. */
export function useTaskEvents(onEvent: () => void): void {
  const { subscribe } = useWebSocket();
  useEffect(() => {
    const types: WsEventType[] = [
      "task_created",
      "task_updated",
      "task_completed",
      "comment_created",
      "comment_deleted",
    ];
    const unsubscribers = types.map((type) => subscribe(type, onEvent));
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  }, [subscribe, onEvent]);
}
