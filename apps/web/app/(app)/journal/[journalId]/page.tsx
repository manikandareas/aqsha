import { NavActions } from "@/components/nav-actions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { JournalEditorScreen } from "@/features/journal/components/journal-editor-screen";
import { JournalRecord } from "@/features/journal/lib/journals";
import React from "react";

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

  return (
    <React.Fragment>
      <header className="flex h-14 shrink-0 items-center gap-2">
        <div className="flex flex-1 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  Project Management
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="ml-auto px-3">
          <NavActions />
        </div>
      </header>
      <JournalEditorScreen journalId={journalId} initialJournal={journal} />
    </React.Fragment>
  );
}
