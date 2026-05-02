export type JournalType = "general" | "proposal" | "thesis";

export type JournalRecord = {
  id: string;
  ownerUserId?: string;
  title: string;
  contentJson: unknown[];
  outlineJson?: unknown;
  plainText?: string | null;
  status?: "active" | "archived";
  archivedAt?: string | null;
  lastOpenedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
  type: JournalType;
};

export type CreateJournalInput = {
  title: string;
};

export const defaultCreateJournalInput: CreateJournalInput = {
  title: "Untitled",
};

export type UpdateJournalInput = {
  title?: string;
};

export type SaveJournalContentInput = {
  baseUpdatedAt: string;
  contentJson: JournalRecord["contentJson"];
  title: string;
};

export const emptyPlateContent = [{ type: "p", children: [{ text: "" }] }];

export function normalizeJournalRecord(journal: unknown): JournalRecord {
  const value = journal as Partial<JournalRecord> | null | undefined;

  return {
    id: String(value?.id ?? ""),
    ownerUserId: value?.ownerUserId,
    title: value?.title?.trim() || "Untitled",
    type: value?.type ?? "general",
    status: value?.status,
    plainText: value?.plainText,
    contentJson: Array.isArray(value?.contentJson)
      ? value.contentJson
      : emptyPlateContent,
    outlineJson: value?.outlineJson,
    archivedAt: value?.archivedAt,
    lastOpenedAt: value?.lastOpenedAt,
    createdAt: value?.createdAt,
    updatedAt: value?.updatedAt ?? new Date().toISOString(),
  };
}
