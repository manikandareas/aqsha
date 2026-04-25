import {
  journalStatuses,
  journalTypes,
  journalVersionTriggers,
  journalVersions,
  journals,
  users,
  workspaces,
  type JournalRecord,
  type JournalVersionRecord,
  type JsonValue,
  type UserRecord,
  type WorkspaceRecord,
} from "@aqsha/db";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import type { DatabaseClient } from "../../database/client";

type JournalStatus = (typeof journalStatuses)[number];
type JournalType = (typeof journalTypes)[number];
type VersionTrigger = (typeof journalVersionTriggers)[number];

export interface ListJournalsInput {
  workspaceId: string;
  status: JournalStatus;
  q?: string;
  limit: number;
}

export interface CreateJournalInput {
  workspaceId: string;
  ownerUserId: string;
  title: string;
  type: JournalType;
  contentJson: JsonValue;
  plainText: string | null;
}

export interface UpdateJournalMetadataInput {
  title?: string;
  type?: JournalType;
}

export interface SaveJournalContentInput {
  title: string;
  contentJson: JsonValue;
  plainText: string | null;
}

export interface ApplyJournalOutlineInput {
  outlineJson: JsonValue;
  contentJson: JsonValue;
  plainText: string | null;
}

export interface JournalContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
}

export type JournalContextLookup =
  | { success: true; data: JournalContext }
  | { success: false; error: "unauthorized" | "workspace_not_found" };

export class JournalRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getContextByAuthUserId(
    authUserId: string,
  ): Promise<JournalContextLookup> {
    const [row] = await this.db
      .select({
        user: users,
        workspace: workspaces,
      })
      .from(users)
      .leftJoin(workspaces, eq(workspaces.ownerUserId, users.id))
      .where(eq(users.id, authUserId))
      .limit(1);

    if (!row) {
      return { success: false, error: "unauthorized" };
    }

    if (!row.workspace) {
      return { success: false, error: "workspace_not_found" };
    }

    return {
      success: true,
      data: { user: row.user, workspace: row.workspace },
    };
  }

  async list(input: ListJournalsInput): Promise<JournalRecord[]> {
    const filters = [
      eq(journals.workspaceId, input.workspaceId),
      eq(journals.status, input.status),
    ];

    if (input.q?.trim()) {
      filters.push(ilike(journals.title, `%${input.q.trim()}%`));
    }

    return this.db
      .select()
      .from(journals)
      .where(and(...filters))
      .orderBy(desc(journals.updatedAt))
      .limit(input.limit);
  }

  async getById(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    const [journal] = await this.db
      .select()
      .from(journals)
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .limit(1);

    return journal ?? null;
  }

  async create(input: CreateJournalInput): Promise<JournalRecord> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [journal] = await tx
        .insert(journals)
        .values({
          workspaceId: input.workspaceId,
          ownerUserId: input.ownerUserId,
          title: input.title,
          type: input.type,
          status: "active",
          contentJson: input.contentJson,
          plainText: input.plainText,
          lastOpenedAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(journalVersions).values({
        journalId: journal.id,
        workspaceId: journal.workspaceId,
        createdByUserId: journal.ownerUserId,
        versionNumber: 1,
        contentJson: journal.contentJson,
        plainText: journal.plainText,
        trigger: "journal_create",
        snapshotLabel: null,
      });

      await tx
        .update(workspaces)
        .set({
          activeJournalCount: sql`${workspaces.activeJournalCount} + 1`,
          updatedAt: now,
        })
        .where(eq(workspaces.id, journal.workspaceId));

      await tx
        .update(users)
        .set({
          onboardingCompletedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, journal.ownerUserId),
            isNull(users.onboardingCompletedAt),
          ),
        );

      return journal;
    });
  }

  async updateMetadata(
    journalId: string,
    workspaceId: string,
    input: UpdateJournalMetadataInput,
  ): Promise<JournalRecord | null> {
    const [journal] = await this.db
      .update(journals)
      .set({
        title: input.title,
        type: input.type,
        updatedAt: new Date(),
      })
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    return journal ?? null;
  }

  async saveContent(
    current: JournalRecord,
    input: SaveJournalContentInput,
  ): Promise<JournalRecord | null> {
    return this.updateJournalContent(current, input, "manual_save");
  }

  async applyOutline(
    current: JournalRecord,
    input: ApplyJournalOutlineInput,
  ): Promise<JournalRecord | null> {
    return this.updateJournalContent(current, input, "outline_apply");
  }

  async archive(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [journal] = await tx
        .update(journals)
        .set({
          status: "archived",
          archivedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(journals.id, journalId),
            eq(journals.workspaceId, workspaceId),
            eq(journals.status, "active"),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx
        .update(workspaces)
        .set({
          activeJournalCount: sql`${workspaces.activeJournalCount} - 1`,
          archivedJournalCount: sql`${workspaces.archivedJournalCount} + 1`,
          updatedAt: now,
        })
        .where(eq(workspaces.id, workspaceId));

      return journal;
    });
  }

  async restore(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [journal] = await tx
        .update(journals)
        .set({
          status: "active",
          archivedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(journals.id, journalId),
            eq(journals.workspaceId, workspaceId),
            eq(journals.status, "archived"),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx
        .update(workspaces)
        .set({
          activeJournalCount: sql`${workspaces.activeJournalCount} + 1`,
          archivedJournalCount: sql`${workspaces.archivedJournalCount} - 1`,
          updatedAt: now,
        })
        .where(eq(workspaces.id, workspaceId));

      return journal;
    });
  }

  async delete(journalId: string, workspaceId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [journal] = await tx
        .delete(journals)
        .where(
          and(
            eq(journals.id, journalId),
            eq(journals.workspaceId, workspaceId),
          ),
        )
        .returning({
          status: journals.status,
        });

      if (!journal) {
        return false;
      }

      await tx
        .update(workspaces)
        .set({
          activeJournalCount:
            journal.status === "active"
              ? sql`${workspaces.activeJournalCount} - 1`
              : sql`${workspaces.activeJournalCount}`,
          archivedJournalCount:
            journal.status === "archived"
              ? sql`${workspaces.archivedJournalCount} - 1`
              : sql`${workspaces.archivedJournalCount}`,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      return true;
    });
  }

  async listVersions(
    journalId: string,
    workspaceId: string,
    limit: number,
  ): Promise<JournalVersionRecord[]> {
    return this.db
      .select()
      .from(journalVersions)
      .where(
        and(
          eq(journalVersions.journalId, journalId),
          eq(journalVersions.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(journalVersions.createdAt))
      .limit(limit);
  }

  private async updateJournalContent(
    current: JournalRecord,
    input: SaveJournalContentInput | ApplyJournalOutlineInput,
    trigger: VersionTrigger,
  ): Promise<JournalRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [nextVersion] = await tx
        .select({
          value: sql<number>`coalesce(max(${journalVersions.versionNumber}), 0) + 1`,
        })
        .from(journalVersions)
        .where(eq(journalVersions.journalId, current.id));

      const [journal] = await tx
        .update(journals)
        .set({
          title: "title" in input ? input.title : current.title,
          contentJson: input.contentJson,
          outlineJson:
            "outlineJson" in input ? input.outlineJson : current.outlineJson,
          plainText: input.plainText,
          updatedAt: now,
          lastOpenedAt: now,
        })
        .where(
          and(
            eq(journals.id, current.id),
            eq(journals.workspaceId, current.workspaceId),
            eq(journals.updatedAt, current.updatedAt),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx.insert(journalVersions).values({
        journalId: journal.id,
        workspaceId: journal.workspaceId,
        createdByUserId: journal.ownerUserId,
        versionNumber: Number(nextVersion?.value ?? 1),
        contentJson: journal.contentJson,
        plainText: journal.plainText,
        trigger,
        snapshotLabel: null,
      });

      return journal;
    });
  }
}
