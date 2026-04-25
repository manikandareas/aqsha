import { eq } from "drizzle-orm";
import { users, type UserRecord } from "@aqsha/db";
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

    if (existing) {
      return this.updateMetadata(existing.id, input);
    }

    return this.create(input);
  }
}
