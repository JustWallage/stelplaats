import { z } from "zod";
import { completionSchema, taskWithStatusSchema } from "./api";

// Every realtime update in the app is one of these events, broadcast through
// the WebsocketDO. Add new event types here first; both ends infer from this.
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
]);

export type WsEvent = z.infer<typeof wsEventSchema>;
export type WsEventType = WsEvent["type"];
