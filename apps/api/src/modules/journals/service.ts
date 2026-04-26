import type { JournalRecord, JournalVersionRecord, JsonValue } from "@aqsha/db";
import type { JournalModel } from "./model";
import { JournalRepository, type JournalContext } from "./repository";

type Identity = {
  authUserId: string;
  authTokenIdentifier: string;
};

type ServiceError =
  | "unauthorized"
  | "workspace_not_found"
  | "journal_not_found"
  | "stale_journal_save";
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceError };

export class JournalService {
  constructor(private readonly repository: JournalRepository) {}

  async list(
    identity: Identity,
    input: JournalModel["listQuery"],
  ): Promise<ServiceResult<JournalModel["journalSummary"][]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journals = await this.repository.list({
      workspaceId: context.workspace.id,
      status: input.status ?? "active",
      q: input.q,
      limit: this.normalizeLimit(input.limit),
    });

    return {
      success: true,
      data: journals.map((journal) => this.toJournalSummary(journal)),
    };
  }

  async getById(
    identity: Identity,
    journalId: string,
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.getById(
      journalId,
      context.workspace.id,
    );

    if (!journal) {
      return { success: false, error: "journal_not_found" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async create(
    identity: Identity,
    input: JournalModel["createBody"],
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.create({
      workspaceId: context.workspace.id,
      ownerUserId: context.user.id,
      title: input.title,
      type: "general",
      contentJson: [{ type: "p", children: [{ text: "" }] }],
      plainText: "",
    });

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async updateMetadata(
    identity: Identity,
    journalId: string,
    input: JournalModel["updateBody"],
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.updateMetadata(
      journalId,
      context.workspace.id,
      input,
    );

    if (!journal) {
      return { success: false, error: "journal_not_found" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async saveContent(
    identity: Identity,
    journalId: string,
    input: JournalModel["saveContentBody"],
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const current = await this.repository.getById(
      journalId,
      context.workspace.id,
    );

    if (!current) {
      return { success: false, error: "journal_not_found" };
    }

    if (this.isStale(current.updatedAt, input.baseUpdatedAt)) {
      return { success: false, error: "stale_journal_save" };
    }

    const journal = await this.repository.saveContent(current, {
      title: input.title,
      contentJson: input.contentJson as JsonValue,
      plainText: input.plainText ?? null,
    });

    if (!journal) {
      return { success: false, error: "stale_journal_save" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async applyOutline(
    identity: Identity,
    journalId: string,
    input: JournalModel["applyOutlineBody"],
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const current = await this.repository.getById(
      journalId,
      context.workspace.id,
    );

    if (!current) {
      return { success: false, error: "journal_not_found" };
    }

    if (this.isStale(current.updatedAt, input.baseUpdatedAt)) {
      return { success: false, error: "stale_journal_save" };
    }

    const journal = await this.repository.applyOutline(current, {
      outlineJson: input.outline as JsonValue,
      contentJson: input.contentJson as JsonValue,
      plainText: input.plainText ?? null,
    });

    if (!journal) {
      return { success: false, error: "stale_journal_save" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async archive(
    identity: Identity,
    journalId: string,
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.archive(
      journalId,
      context.workspace.id,
    );

    if (!journal) {
      return { success: false, error: "journal_not_found" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async restore(
    identity: Identity,
    journalId: string,
  ): Promise<ServiceResult<JournalModel["journal"]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.restore(
      journalId,
      context.workspace.id,
    );

    if (!journal) {
      return { success: false, error: "journal_not_found" };
    }

    return {
      success: true,
      data: this.toJournal(journal),
    };
  }

  async delete(
    identity: Identity,
    journalId: string,
  ): Promise<ServiceResult<{ ok: true }>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const deleted = await this.repository.delete(
      journalId,
      context.workspace.id,
    );

    if (!deleted) {
      return { success: false, error: "journal_not_found" };
    }

    return { success: true, data: { ok: true } };
  }

  async listVersions(
    identity: Identity,
    journalId: string,
    input: JournalModel["versionsQuery"],
  ): Promise<ServiceResult<JournalModel["journalVersion"][]>> {
    const context = await this.getContext(identity);

    if (typeof context === "string") {
      return { success: false, error: context };
    }

    const journal = await this.repository.getById(
      journalId,
      context.workspace.id,
    );

    if (!journal) {
      return { success: false, error: "journal_not_found" };
    }

    const versions = await this.repository.listVersions(
      journal.id,
      context.workspace.id,
      this.normalizeLimit(input.limit),
    );

    return {
      success: true,
      data: versions.map((version) => this.toJournalVersion(version)),
    };
  }

  private toJournalSummary(
    journal: JournalRecord,
  ): JournalModel["journalSummary"] {
    return {
      id: journal.id,
      workspaceId: journal.workspaceId,
      ownerUserId: journal.ownerUserId,
      title: journal.title,
      type: journal.type,
      status: journal.status,
      plainText: journal.plainText,
      archivedAt: journal.archivedAt?.toISOString() ?? null,
      lastOpenedAt: journal.lastOpenedAt?.toISOString() ?? null,
      createdAt: journal.createdAt.toISOString(),
      updatedAt: journal.updatedAt.toISOString(),
    };
  }

  private toJournal(journal: JournalRecord): JournalModel["journal"] {
    return {
      ...this.toJournalSummary(journal),
      contentJson: journal.contentJson,
      outlineJson: journal.outlineJson,
    };
  }

  private toJournalVersion(
    version: JournalVersionRecord,
  ): JournalModel["journalVersion"] {
    return {
      id: version.id,
      journalId: version.journalId,
      workspaceId: version.workspaceId,
      createdByUserId: version.createdByUserId,
      versionNumber: version.versionNumber,
      contentJson: version.contentJson,
      plainText: version.plainText,
      trigger: version.trigger,
      snapshotLabel: version.snapshotLabel,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private async getContext(
    identity: Identity,
  ): Promise<JournalContext | "unauthorized" | "workspace_not_found"> {
    const result = await this.repository.getContextByAuthUserId(
      identity.authUserId,
    );

    return result.success ? result.data : result.error;
  }

  private normalizeLimit(limit: number | undefined): number {
    if (!limit || Number.isNaN(limit)) {
      return 50;
    }
    return Math.min(Math.max(Math.trunc(limit), 1), 100);
  }

  private isStale(currentUpdatedAt: Date, baseUpdatedAt: string): boolean {
    const baseDate = new Date(baseUpdatedAt);

    if (Number.isNaN(baseDate.getTime())) {
      return true;
    }

    return currentUpdatedAt.getTime() !== baseDate.getTime();
  }
}
