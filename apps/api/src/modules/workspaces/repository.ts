import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  subscriptions,
  users,
  userWorkspacePreferences,
  workspaceMembers,
  workspaces,
  type SubscriptionRecord,
  type UserRecord,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
} from "@aqsha/db";
import type { DatabaseClient } from "../../database/client";
import { getDefaultWorkspaceName } from "./model";

type WorkspaceRole = WorkspaceMemberRecord["role"];
type PlanCode = SubscriptionRecord["planCode"];

export interface ActiveWorkspaceContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
  role: WorkspaceRole;
}

export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string | null;
  role: WorkspaceRole;
  planCode: PlanCode;
  isActive: boolean;
}

interface WorkspaceMembershipRow {
  workspace: WorkspaceRecord;
  member: WorkspaceMemberRecord;
  subscription: SubscriptionRecord | null;
}

export class WorkspaceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getOwnedWorkspace(userId: string): Promise<WorkspaceRecord | null> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .orderBy(asc(workspaces.createdAt))
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
      await this.ensureActiveWorkspace(user.id, existing.id);
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
    await this.ensureActiveWorkspace(user.id, workspace.id);

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
        .orderBy(asc(workspaces.createdAt))
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

      await tx
        .insert(userWorkspacePreferences)
        .values({
          userId: user.id,
          activeWorkspaceId: workspace.id,
        })
        .onConflictDoUpdate({
          target: userWorkspacePreferences.userId,
          set: {
            activeWorkspaceId: workspace.id,
            updatedAt: new Date(),
          },
        });

      return workspace;
    });
  }

  async createWorkspace(user: UserRecord, name: string): Promise<WorkspaceRecord> {
    return this.db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          ownerUserId: user.id,
          name,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      });

      await tx.insert(subscriptions).values({
        workspaceId: workspace.id,
        provider: "internal",
        providerSubscriptionId: `internal:free:${workspace.id}`,
        planCode: "free",
        status: "active",
        startedAt: new Date(),
      });

      await tx
        .insert(userWorkspacePreferences)
        .values({
          userId: user.id,
          activeWorkspaceId: workspace.id,
        })
        .onConflictDoUpdate({
          target: userWorkspacePreferences.userId,
          set: {
            activeWorkspaceId: workspace.id,
            updatedAt: new Date(),
          },
        });

      return workspace;
    });
  }

  async setActiveWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRecord | null> {
    const row = await this.getMembershipRow(userId, workspaceId);

    if (!row) {
      return null;
    }

    await this.ensureActiveWorkspace(userId, workspaceId);

    return row.workspace;
  }

  async getActiveWorkspaceContext(
    userId: string,
  ): Promise<ActiveWorkspaceContext | null> {
    const rows = await this.getMembershipRows(userId);

    if (rows.length === 0) {
      return null;
    }

    const [preference] = await this.db
      .select()
      .from(userWorkspacePreferences)
      .where(eq(userWorkspacePreferences.userId, userId))
      .limit(1);

    const activeRow =
      rows.find(
        (row) => row.workspace.id === preference?.activeWorkspaceId,
      ) ?? rows[0];

    if (activeRow.workspace.id !== preference?.activeWorkspaceId) {
      await this.ensureActiveWorkspace(userId, activeRow.workspace.id);
    }

    const user = await this.getUser(userId);

    if (!user) {
      return null;
    }

    return {
      user,
      workspace: activeRow.workspace,
      role: activeRow.member.role,
    };
  }

  async getWorkspaceList(userId: string): Promise<WorkspaceListItem[]> {
    const rows = await this.getMembershipRows(userId);

    if (rows.length === 0) {
      return [];
    }

    const activeContext = await this.getActiveWorkspaceContext(userId);
    const activeWorkspaceId = activeContext?.workspace.id ?? rows[0].workspace.id;

    return rows.map((row) => this.toWorkspaceListItem(row, activeWorkspaceId));
  }

  async getWorkspaceListWithActive(
    userId: string,
  ): Promise<{ workspaces: WorkspaceListItem[]; activeWorkspaceId: string } | null> {
    const workspaces = await this.getWorkspaceList(userId);
    const active = workspaces.find((workspace) => workspace.isActive);

    if (!active) {
      return null;
    }

    return { workspaces, activeWorkspaceId: active.id };
  }

  private async getUser(userId: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ?? null;
  }

  private async getMembershipRow(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipRow | null> {
    const [row] = await this.db
      .select({
        workspace: workspaces,
        member: workspaceMembers,
        subscription: subscriptions,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.workspaceId, workspaces.id),
          inArray(subscriptions.status, ["active", "trialing"]),
          isNull(subscriptions.endedAt),
        ),
      )
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  private async getMembershipRows(
    userId: string,
  ): Promise<WorkspaceMembershipRow[]> {
    return this.db
      .select({
        workspace: workspaces,
        member: workspaceMembers,
        subscription: subscriptions,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.workspaceId, workspaces.id),
          inArray(subscriptions.status, ["active", "trialing"]),
          isNull(subscriptions.endedAt),
        ),
      )
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.createdAt));
  }

  private toWorkspaceListItem(
    row: WorkspaceMembershipRow,
    activeWorkspaceId: string,
  ): WorkspaceListItem {
    return {
      id: row.workspace.id,
      name: row.workspace.name,
      slug: row.workspace.slug,
      role: row.member.role,
      planCode: row.subscription?.planCode ?? "free",
      isActive: row.workspace.id === activeWorkspaceId,
    };
  }

  private async ensureActiveWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.db
      .insert(userWorkspacePreferences)
      .values({
        userId,
        activeWorkspaceId: workspaceId,
      })
      .onConflictDoUpdate({
        target: userWorkspacePreferences.userId,
        set: {
          activeWorkspaceId: workspaceId,
          updatedAt: new Date(),
        },
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
