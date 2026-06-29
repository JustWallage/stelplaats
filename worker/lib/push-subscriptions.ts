import { eq, ne } from "drizzle-orm";
import { pushSubscriptions, type PushSubscriptionRow } from "../../db/schema";
import type { PushSubscriptionInput } from "../../shared/api";
import type { Db } from "./db";

// Upsert by endpoint: re-subscribing the same device (same push endpoint)
// refreshes its keys and owner instead of creating a duplicate row.
export async function savePushSubscription(
  db: Db,
  userEmail: string,
  input: PushSubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userEmail,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userEmail, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
}

export async function deletePushSubscription(
  db: Db,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function loadSubscriptionsForUser(
  db: Db,
  userEmail: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userEmail, userEmail));
}

/** Every subscription — the audience for the daily due-task notifications. */
export async function loadAllSubscriptions(
  db: Db,
): Promise<PushSubscriptionRow[]> {
  return db.select().from(pushSubscriptions);
}

/** Subscriptions belonging to everyone except `userEmail` (the actor). */
export async function loadSubscriptionsExcept(
  db: Db,
  userEmail: string,
): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(ne(pushSubscriptions.userEmail, userEmail));
}
