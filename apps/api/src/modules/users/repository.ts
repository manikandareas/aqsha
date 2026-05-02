import { and, eq, inArray, isNull } from "drizzle-orm";
import { subscriptions, users, type SubscriptionRecord, type UserRecord } from "@aqsha/db";
import type { DatabaseClient } from "../../database/client";
import type { AuthProfileInput } from "./model";

export class UserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, authUserId))
      .limit(1);

    return user ?? null;
  }

  async create(input: AuthProfileInput): Promise<UserRecord> {
    const [user] = await this.db.insert(users).values(input).returning();
    return user;
  }

  async updateMetadata(
    userId: string,
    input: AuthProfileInput,
  ): Promise<UserRecord> {
    const [user] = await this.db
      .update(users)
      .set({
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        avatarUrl: input.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async completeOnboarding(userId: string): Promise<UserRecord> {
    const [user] = await this.db
      .update(users)
      .set({
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async ensureProfile(input: AuthProfileInput): Promise<UserRecord> {
    const existing = await this.getByAuthUserId(input.id);

    const user = existing
      ? await this.updateMetadata(existing.id, input)
      : await this.create(input);

    await this.ensureInternalFreeSubscription(user.id);

    return user;
  }

  async getCurrentSubscription(
    userId: string,
  ): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          isNull(subscriptions.endedAt),
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  private async getActiveOrTrialingSubscription(
    userId: string,
  ): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ["active", "trialing"]),
          isNull(subscriptions.endedAt),
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  private async ensureInternalFreeSubscription(userId: string): Promise<void> {
    const existingActiveSubscription =
      await this.getActiveOrTrialingSubscription(userId);

    if (existingActiveSubscription) {
      return;
    }

    await this.db
      .insert(subscriptions)
      .values({
        userId,
        provider: "internal",
        providerSubscriptionId: `internal:free:${userId}`,
        planCode: "free",
        status: "active",
        startedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
