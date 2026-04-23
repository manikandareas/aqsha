import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  subscriptions,
  users,
  workspaceMembers,
  workspaces,
  type UserRecord,
} from "@aqsha/db";
import type { DatabaseClient } from "../../database/client";
import { getDefaultWorkspaceName } from "../workspaces/model";
import type { ClerkProfileInput } from "./model";

export class UserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getByIdentity(
    authTokenIdentifier: string,
    clerkUserId: string,
  ): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.authTokenIdentifier, authTokenIdentifier),
          eq(users.clerkUserId, clerkUserId),
        ),
      )
      .limit(1);

    return user ?? null;
  }

  async create(input: ClerkProfileInput): Promise<UserRecord> {
    const [user] = await this.db.insert(users).values(input).returning();
    return user;
  }

  async updateMetadata(
    userId: string,
    input: ClerkProfileInput,
  ): Promise<UserRecord> {
    const [user] = await this.db
      .update(users)
      .set({
        clerkUserId: input.clerkUserId,
        authTokenIdentifier: input.authTokenIdentifier,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async ensureProfile(input: ClerkProfileInput): Promise<UserRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(
          or(
            eq(users.authTokenIdentifier, input.authTokenIdentifier),
            eq(users.clerkUserId, input.clerkUserId),
          ),
        )
        .limit(1);

      const [user] = existing
        ? await tx
            .update(users)
            .set({
              clerkUserId: input.clerkUserId,
              authTokenIdentifier: input.authTokenIdentifier,
              email: input.email,
              name: input.name,
              avatarUrl: input.avatarUrl,
              updatedAt: new Date(),
            })
            .where(eq(users.id, existing.id))
            .returning()
        : await tx.insert(users).values(input).returning();

      const [existingWorkspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, user.id))
        .limit(1);

      const [workspace] = existingWorkspace
        ? [existingWorkspace]
        : await tx
            .insert(workspaces)
            .values({
              ownerUserId: user.id,
              name: getDefaultWorkspaceName({
                name: user.name,
                email: user.email,
              }),
            })
            .returning();

      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner",
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: {
            role: "owner",
            updatedAt: new Date(),
          },
        });

      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.role, "owner"),
            ne(workspaceMembers.userId, user.id),
          ),
        );

      const [existingSubscription] = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.workspaceId, workspace.id),
            inArray(subscriptions.status, ["active", "trialing"]),
            isNull(subscriptions.endedAt),
          ),
        )
        .limit(1);

      if (!existingSubscription) {
        await tx
          .insert(subscriptions)
          .values({
            workspaceId: workspace.id,
            provider: "internal",
            providerSubscriptionId: `internal:free:${workspace.id}`,
            planCode: "free",
            status: "active",
            startedAt: new Date(),
          })
          .onConflictDoNothing();
      }

      return user;
    });
  }
}
