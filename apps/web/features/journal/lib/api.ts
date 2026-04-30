import { api } from "@/lib/eden";
import {
  normalizeJournalRecord,
  type CreateJournalInput,
  type JournalRecord,
  type SaveJournalContentInput,
} from "./journals";

export async function listJournals(): Promise<JournalRecord[]> {
  const response = await api.journals.get({ query: { status: "active" } });

  if (response.error) {
    throw response.error;
  }

  return (response.data ?? []).map(normalizeJournalRecord);
}

export async function createJournal({
  title,
}: CreateJournalInput): Promise<JournalRecord> {
  const response = await api.journals.post({ title });

  if (response.error) {
    throw response.error;
  }

  return normalizeJournalRecord(response.data);
}

export async function deleteJournal(id: string): Promise<void> {
  const response = await api.journals({ id }).delete();

  if (response.error) {
    throw response.error;
  }
}

export async function saveJournalContent(
  id: string,
  input: SaveJournalContentInput & { plainText: string },
): Promise<JournalRecord> {
  const response = await api.journals({ id }).content.put(input);

  if (response.error) {
    throw response.error;
  }

  return normalizeJournalRecord(response.data);
}
