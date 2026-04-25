import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  subscriptions,
  workspaceMembers,
  workspaces,
  type SubscriptionRecord,
  type UserRecord,
  type WorkspaceRecord,
} from "@aqsha/db";
import type { DatabaseClient } from "../../database/client";
import { getDefaultWorkspaceName } from "./model";

export class WorkspaceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getOwnedWorkspace(userId: string): Promise<WorkspaceRecord | null> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .limit(1);

    return workspace ?? null;
  }

  async getCurrentSubscription(
    workspaceId: string,
  ): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, workspaceId),
          isNull(subscriptions.endedAt),
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  async getActiveOrTrialingSubscription(
    workspaceId: string,
  ): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, workspaceId),
          inArray(subscriptions.status, ["active", "trialing"]),
          isNull(subscriptions.endedAt),
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  async ensureDefaultWorkspace(user: UserRecord): Promise<WorkspaceRecord> {
    const existing = await this.getOwnedWorkspace(user.id);

    if (existing) {
      await this.ensureOwnerMembership(existing.id, user.id);
      await this.ensureInternalFreeSubscription(existing.id);
      return existing;
    }

    const [workspace] = await this.db
      .insert(workspaces)
      .values({
        ownerUserId: user.id,
        name: getDefaultWorkspaceName({
          name: user.name,
          email: user.email,
        }),
      })
      .returning();

    await this.ensureOwnerMembership(workspace.id, user.id);
    await this.ensureInternalFreeSubscription(workspace.id);

    return workspace;
  }

  async ensureNamedOwnedWorkspace(
    user: UserRecord,
    workspaceName: string,
  ): Promise<WorkspaceRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, user.id))
        .limit(1);

      const [workspace] = existing
        ? await tx
            .update(workspaces)
            .set({
              name: workspaceName,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, existing.id))
            .returning()
        : await tx
            .insert(workspaces)
            .values({
              ownerUserId: user.id,
              name: workspaceName,
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

      const [existingActiveSubscription] = await tx
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

      if (!existingActiveSubscription) {
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

      return workspace;
    });
  }

  private async ensureOwnerMembership(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await this.db
      .insert(workspaceMembers)
      .values({
        workspaceId,
        userId,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: {
          role: "owner",
          updatedAt: new Date(),
        },
      });

    await this.db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, "owner"),
          ne(workspaceMembers.userId, userId),
        ),
      );
  }

  private async ensureInternalFreeSubscription(
    workspaceId: string,
  ): Promise<void> {
    const existingActiveSubscription =
      await this.getActiveOrTrialingSubscription(workspaceId);

    if (existingActiveSubscription) {
      return;
    }

    await this.db
      .insert(subscriptions)
      .values({
        workspaceId,
        provider: "internal",
        providerSubscriptionId: `internal:free:${workspaceId}`,
        planCode: "free",
        status: "active",
        startedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
