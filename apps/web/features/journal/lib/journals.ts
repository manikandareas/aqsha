export type JournalType = "general_paper";

export type JournalRecord = {
  id: string;
  title: string;
  contentJson: unknown[];
  updatedAt: string;
  type: JournalType;
};

export type CreateJournalInput = {
  title: string;
  type: JournalType;
};

export const defaultCreateJournalInput: CreateJournalInput = {
  title: "Untitled",
  type: "general_paper",
};

export type UpdateJournalInput = {
  title?: string;
};

export type SaveJournalContentInput = {
  baseUpdatedAt: string;
  contentJson: JournalRecord["contentJson"];
  title: string;
};
