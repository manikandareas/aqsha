import { WorkspacePlateJournalEditor } from "@/features/journal/components/workspace-plate-journal-editor"
import type { JournalRecord } from "../lib/journals"

export function JournalEditorScreen({
  journalId,
  initialJournal,
}: {
  journalId: string
  initialJournal: JournalRecord
}) {
  return (
    <WorkspacePlateJournalEditor journal={initialJournal} key={journalId} />
  )
}
