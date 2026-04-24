import { JournalEditorScreen } from "@/features/journal/components/journal-editor-screen";
import { JournalRecord } from "@/features/journal/lib/journals";

function createMockJournal(journalId: string): JournalRecord {
  return {
    id: journalId,
    title: "Untitled",
    contentJson: [
      {
        type: "p",
        children: [{ text: "" }],
      },
    ],
    updatedAt: new Date().toISOString(),
    type: "general_paper",
  };
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ journalId: string }>;
}) {
  const { journalId } = await params;

  const journal = createMockJournal(journalId);

  return <JournalEditorScreen journalId={journalId} initialJournal={journal} />;
}
