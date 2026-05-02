import {
  journalStatuses,
  journalTypes,
  journalVersionTriggers,
  journalVersions,
  journals,
  users,
  type JournalRecord,
  type JournalVersionRecord,
  type JsonValue,
} from "@aqsha/db";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import type { DatabaseClient } from "../../database/client";

type JournalStatus = (typeof journalStatuses)[number];
type JournalType = (typeof journalTypes)[number];
type VersionTrigger = (typeof journalVersionTriggers)[number];

export interface ListJournalsInput {
  ownerUserId: string;
  status: JournalStatus;
  q?: string;
  limit: number;
}

export interface CreateJournalInput {
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

export class JournalRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(input: ListJournalsInput): Promise<JournalRecord[]> {
    const filters = [
      eq(journals.ownerUserId, input.ownerUserId),
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
    ownerUserId: string,
  ): Promise<JournalRecord | null> {
    const [journal] = await this.db
      .select()
      .from(journals)
      .where(
        and(eq(journals.id, journalId), eq(journals.ownerUserId, ownerUserId)),
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
        createdByUserId: journal.ownerUserId,
        versionNumber: 1,
        contentJson: journal.contentJson,
        plainText: journal.plainText,
        trigger: "journal_create",
        snapshotLabel: null,
      });

      await tx
        .update(users)
        .set({
          activeJournalCount: sql`${users.activeJournalCount} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, journal.ownerUserId));

      await tx
        .update(users)
        .set({
          onboardingCompletedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(users.id, journal.ownerUserId), isNull(users.onboardingCompletedAt)),
        );

      return journal;
    });
  }

  async updateMetadata(
    journalId: string,
    ownerUserId: string,
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
        and(eq(journals.id, journalId), eq(journals.ownerUserId, ownerUserId)),
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
    ownerUserId: string,
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
            eq(journals.ownerUserId, ownerUserId),
            eq(journals.status, "active"),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx
        .update(users)
        .set({
          activeJournalCount: sql`${users.activeJournalCount} - 1`,
          archivedJournalCount: sql`${users.archivedJournalCount} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, ownerUserId));

      return journal;
    });
  }

  async restore(
    journalId: string,
    ownerUserId: string,
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
            eq(journals.ownerUserId, ownerUserId),
            eq(journals.status, "archived"),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx
        .update(users)
        .set({
          activeJournalCount: sql`${users.activeJournalCount} + 1`,
          archivedJournalCount: sql`${users.archivedJournalCount} - 1`,
          updatedAt: now,
        })
        .where(eq(users.id, ownerUserId));

      return journal;
    });
  }

  async delete(journalId: string, ownerUserId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [journal] = await tx
        .delete(journals)
        .where(
          and(
            eq(journals.id, journalId),
            eq(journals.ownerUserId, ownerUserId),
          ),
        )
        .returning({
          status: journals.status,
        });

      if (!journal) {
        return false;
      }

      await tx
        .update(users)
        .set({
          activeJournalCount:
            journal.status === "active"
              ? sql`${users.activeJournalCount} - 1`
              : sql`${users.activeJournalCount}`,
          archivedJournalCount:
            journal.status === "archived"
              ? sql`${users.archivedJournalCount} - 1`
              : sql`${users.archivedJournalCount}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ownerUserId));

      return true;
    });
  }

  async listVersions(
    journalId: string,
    ownerUserId: string,
    limit: number,
  ): Promise<JournalVersionRecord[]> {
    return this.db
      .select()
      .from(journalVersions)
      .innerJoin(journals, eq(journals.id, journalVersions.journalId))
      .where(
        and(
          eq(journalVersions.journalId, journalId),
          eq(journals.ownerUserId, ownerUserId),
        ),
      )
      .orderBy(desc(journalVersions.createdAt))
      .limit(limit)
      .then((rows) => rows.map((row) => row.journal_versions));
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
            eq(journals.ownerUserId, current.ownerUserId),
            eq(journals.updatedAt, current.updatedAt),
          ),
        )
        .returning();

      if (!journal) {
        return null;
      }

      await tx.insert(journalVersions).values({
        journalId: journal.id,
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
