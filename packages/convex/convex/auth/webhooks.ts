import type { MutationCtx } from "../_generated/server";
import { findUserByClerkUserId } from "./userRepository";

export type ClerkWebhookArgs = {
  eventId: string;
  eventType: string;
  clerkUserId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  deleted?: boolean;
};

export async function processClerkWebhook(ctx: MutationCtx, args: ClerkWebhookArgs) {
  const existingEvent = await ctx.db
    .query("authEvents")
    .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventId))
    .unique();
  if (existingEvent) {
    return { processed: false };
  }

  const user = await findUserByClerkUserId(ctx, args.clerkUserId);
  if (user) {
    const now = Date.now();
    await ctx.db.patch("users", user._id, {
      email: args.email ?? user.email,
      name: args.name ?? user.name,
      image: args.image ?? user.image,
      deletedAt: args.deleted ? now : user.deletedAt,
      deletionStatus: args.deleted ? "deleted" : user.deletionStatus,
      deletionCompletedAt: args.deleted ? now : user.deletionCompletedAt,
      updatedAt: now,
    });
  }

  await ctx.db.insert("authEvents", {
    eventKey: args.eventId,
    eventType: args.eventType,
    clerkUserId: args.clerkUserId,
    processedAt: Date.now(),
  });

  return { processed: true };
}

export async function markClerkUserDeleted(ctx: MutationCtx, clerkUserId: string) {
  const user = await findUserByClerkUserId(ctx, clerkUserId);
  if (user) {
    const now = Date.now();
    await ctx.db.patch("users", user._id, {
      deletedAt: now,
      deletionStatus: "deleted",
      deletionCompletedAt: now,
      updatedAt: now,
    });
  }
}
