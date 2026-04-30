import {
  ClockIcon,
  MessageSquareIcon,
  StarIcon,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { JournalPageActions } from "@/features/journal/components/journal-page-actions";
import { WorkspacePlateJournalEditor } from "@/features/journal/components/workspace-plate-journal-editor";
import {
  normalizeJournalRecord,
  type JournalRecord,
} from "@/features/journal/lib/journals";
import { createServerApiClient } from "@/lib/server-eden";
import { SaveStatusBadge } from "@/features/journal/components/save-status-badge";

async function getJournal(journalId: string): Promise<JournalRecord> {
  const api = await createServerApiClient();
  const response = await api.journals({ id: journalId }).get();

  if (response.error || !response.data) {
    notFound();
  }

  return normalizeJournalRecord(response.data);
}

function formatEditedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `Edited ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date)}`;
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ journalId: string }>;
}) {
  const { journalId } = await params;
  const journal = await getJournal(journalId);

  return (
    <div className="flex h-full flex-col bg-background text-foreground relative">
      {/* Notion-style top bar */}
      <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between bg-background px-2 sm:px-3">
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
                  {journal.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden text-[12px] font-medium text-muted-foreground sm:inline-block mr-1">
            {formatEditedDate(journal.updatedAt)}
          </span>

          <SaveStatusBadge journal={journal} />

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Comments"
            >
              <MessageSquareIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Page history"
            >
              <ClockIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Favorite"
            >
              <StarIcon className="h-4 w-4" />
            </Button>
          </div>
          <JournalPageActions journal={journal} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <WorkspacePlateJournalEditor key={journalId} journal={journal} />
      </main>
    </div>
  );
}
