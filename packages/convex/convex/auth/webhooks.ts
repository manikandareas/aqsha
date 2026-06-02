import type { MutationCtx } from "../_generated/server";
import { cleanupOwnerUserData } from "./accountDeletion";
import { findUserByClerkUserId } from "./userRepository";

export type ClerkWebhookArgs = {
  eventId: string;
  eventType: string;
  clerkUserId: string;
  email?: string | null;
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
    if (args.deleted) {
      await cleanupOwnerUserData(ctx, {
        ownerUserId: user.ownerUserId,
        avatarImage: user.image,
      });
    } else {
      await ctx.db.patch("users", user._id, {
        email: args.email ?? user.email,
        updatedAt: Date.now(),
      });
    }
  }

  await ctx.db.insert("authEvents", {
    eventKey: args.eventId,
    eventType: args.eventType,
    clerkUserId: args.clerkUserId,
    processedAt: Date.now(),
  });

  return { processed: true };
}
