import type {
  CreateJournalInput,
  JournalRecord,
  JournalVersionRecord,
  SaveJournalContentInput,
  UpdateJournalInput,
} from "@aqsha/db";
import { journalRepository } from "./repository";

export class JournalService {
  constructor(private readonly repository = journalRepository) {}

  listByWorkspace(workspaceId: string): Promise<JournalRecord[]> {
    return this.repository.listByWorkspace(workspaceId);
  }

  getById(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    return this.repository.getById(journalId, workspaceId);
  }

  create(input: CreateJournalInput): Promise<JournalRecord> {
    return this.repository.create(input);
  }

  updateMetadata(
    journalId: string,
    workspaceId: string,
    input: UpdateJournalInput,
  ): Promise<JournalRecord | null> {
    return this.repository.updateMetadata(journalId, workspaceId, input);
  }

  saveContent(
    journalId: string,
    workspaceId: string,
    input: SaveJournalContentInput,
  ): Promise<JournalRecord | null> {
    return this.repository.saveContent(journalId, workspaceId, input);
  }

  archive(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    return this.repository.archive(journalId, workspaceId);
  }

  restore(
    journalId: string,
    workspaceId: string,
  ): Promise<JournalRecord | null> {
    return this.repository.restore(journalId, workspaceId);
  }

  delete(journalId: string, workspaceId: string): Promise<boolean> {
    return this.repository.delete(journalId, workspaceId);
  }

  listVersions(journalId: string): Promise<JournalVersionRecord[]> {
    return this.repository.listVersions(journalId);
  }
}
