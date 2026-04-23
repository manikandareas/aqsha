import { and, desc, eq, sql } from "drizzle-orm";
import {
  journalVersions,
  journals,
  workspaces,
  type CreateJournalInput,
  type JournalRecord,
  type JournalVersionRecord,
  type SaveJournalContentInput,
  type UpdateJournalInput,
} from "@aqsha/db";
import { database } from "../../database/client";

type VersionTrigger = JournalVersionRecord["trigger"];

export class JournalRepository {
  constructor(private readonly db: typeof database = database) {}

  async listByWorkspace(workspaceId: string): Promise<JournalRecord[]> {
    return this.db
      .select()
      .from(journals)
      .where(eq(journals.workspaceId, workspaceId))
      .orderBy(desc(journals.updatedAt));
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
    const now = new Date();
    const [journal] = await this.db
      .insert(journals)
      .values({
        workspaceId: input.workspaceId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        type: input.type,
        status: "active",
        contentJson: input.contentJson ?? [],
        outlineJson: input.outlineJson ?? null,
        plainText: input.plainText ?? null,
        lastOpenedAt: input.lastOpenedAt ?? now,
        updatedAt: now,
      })
      .returning();

    await this.createVersion({
      journalId: journal.id,
      workspaceId: journal.workspaceId,
      createdByUserId: journal.ownerUserId,
      contentJson: journal.contentJson,
      plainText: journal.plainText,
      trigger: "journal_create",
    });

    await this.updateWorkspaceCounts(journal.workspaceId);

    return journal;
  }

  async updateMetadata(
    journalId: string,
    workspaceId: string,
    input: UpdateJournalInput,
  ): Promise<JournalRecord | null> {
    const values: Partial<typeof journals.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      values.title = input.title;
    }

    if (input.type !== undefined) {
      values.type = input.type;
    }

    const [journal] = await this.db
      .update(journals)
      .set(values)
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    return journal ?? null;
  }

  async saveContent(
    journalId: string,
    workspaceId: string,
    input: SaveJournalContentInput,
  ): Promise<JournalRecord | null> {
    const current = await this.getById(journalId, workspaceId);

    if (!current) {
      return null;
    }

    if (current.updatedAt.getTime() !== input.baseUpdatedAt.getTime()) {
      throw new Error("stale_journal_save");
    }

    const now = new Date();
    const [journal] = await this.db
      .update(journals)
      .set({
        title: input.title,
        contentJson: input.contentJson,
        plainText: input.plainText ?? null,
        updatedAt: now,
        lastOpenedAt: now,
      })
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    if (!journal) {
      return null;
    }

    await this.createVersion({
      journalId: journal.id,
      workspaceId: journal.workspaceId,
      createdByUserId: journal.ownerUserId,
      contentJson: journal.contentJson,
      plainText: journal.plainText,
      trigger: "manual_save",
    });

    return journal;
  }

  async archive(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    const [journal] = await this.db
      .update(journals)
      .set({
        status: "archived",
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    if (!journal) {
      return null;
    }

    await this.updateWorkspaceCounts(workspaceId);
    return journal;
  }

  async restore(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    const [journal] = await this.db
      .update(journals)
      .set({
        status: "active",
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    if (!journal) {
      return null;
    }

    await this.updateWorkspaceCounts(workspaceId);
    return journal;
  }

  async delete(journalId: string, workspaceId: string): Promise<boolean> {
    const [deletedJournal] = await this.db
      .delete(journals)
      .where(
        and(eq(journals.id, journalId), eq(journals.workspaceId, workspaceId)),
      )
      .returning();

    if (!deletedJournal) {
      return false;
    }

    await this.updateWorkspaceCounts(workspaceId);
    return true;
  }

  async listVersions(journalId: string): Promise<JournalVersionRecord[]> {
    return this.db
      .select()
      .from(journalVersions)
      .where(eq(journalVersions.journalId, journalId))
      .orderBy(desc(journalVersions.createdAt));
  }

  private async createVersion(input: {
    journalId: string;
    workspaceId: string;
    createdByUserId: string;
    contentJson: JournalRecord["contentJson"];
    plainText: JournalRecord["plainText"];
    trigger: VersionTrigger;
    snapshotLabel?: string | null;
  }): Promise<JournalVersionRecord> {
    const [nextVersion] = await this.db
      .select({
        value: sql<number>`coalesce(max(${journalVersions.versionNumber}), 0) + 1`,
      })
      .from(journalVersions)
      .where(eq(journalVersions.journalId, input.journalId));

    const [version] = await this.db
      .insert(journalVersions)
      .values({
        journalId: input.journalId,
        workspaceId: input.workspaceId,
        createdByUserId: input.createdByUserId,
        versionNumber: nextVersion?.value ?? 1,
        contentJson: input.contentJson,
        plainText: input.plainText,
        trigger: input.trigger,
        snapshotLabel: input.snapshotLabel ?? null,
      })
      .returning();

    return version;
  }

  private async updateWorkspaceCounts(workspaceId: string): Promise<void> {
    const [{ activeCount }] = await this.db
      .select({
        activeCount: sql<number>`count(*)`,
      })
      .from(journals)
      .where(
        and(
          eq(journals.workspaceId, workspaceId),
          eq(journals.status, "active"),
        ),
      );

    const [{ archivedCount }] = await this.db
      .select({
        archivedCount: sql<number>`count(*)`,
      })
      .from(journals)
      .where(
        and(
          eq(journals.workspaceId, workspaceId),
          eq(journals.status, "archived"),
        ),
      );

    await this.db
      .update(workspaces)
      .set({
        activeJournalCount: Number(activeCount ?? 0),
        archivedJournalCount: Number(archivedCount ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
  }
}

export const journalRepository = new JournalRepository(database);
