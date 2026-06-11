import type { MutationCtx } from "../_generated/server";

// Seed a positive interest floor for every topic (no 5-topic cap, unlike
// feed interaction bumps). Used by onboarding to translate picked fields into
// feed signal. Idempotent: re-running raises each topic to at most `weight`
// rather than stacking, so re-completing onboarding never inflates weights.
export async function seedFeedInterests(
  ctx: MutationCtx,
  ownerUserId: string,
  topics: string[],
  weight: number,
): Promise<void> {
  const now = Date.now();
  const seen = new Set<string>();
  for (const raw of topics) {
    const topic = raw.trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    const existing = await ctx.db
      .query("userFeedInterests")
      .withIndex("by_owner_topic", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("topic", topic),
      )
      .unique();
    if (existing) {
      if (existing.weight < weight) {
        await ctx.db.patch("userFeedInterests", existing._id, {
          weight,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("userFeedInterests", {
        ownerUserId,
        topic,
        weight,
        updatedAt: now,
      });
    }
  }
}
