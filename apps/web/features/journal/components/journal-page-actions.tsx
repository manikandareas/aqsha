"use client";

import * as React from "react";
import { MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmTitleDeleteDialog } from "@/components/confirm-title-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JournalRecord } from "@/features/journal/lib/journals";
import { useDeleteJournalMutation } from "@/features/journal/lib/queries";
import { getEdenErrorMessage } from "@/lib/eden-error";

const journalDeletionFailedMessage = "Journal deletion failed. Try again.";

function getDeleteErrorMessage(error: unknown): string {
  return getEdenErrorMessage(error, journalDeletionFailedMessage);
}

export function JournalPageActions({ journal }: { journal: JournalRecord }) {
  const router = useRouter();
  const deleteJournalMutation = useDeleteJournalMutation();
  const [isAlertOpen, setIsAlertOpen] = React.useState(false);

  async function handleDelete(): Promise<void> {
    try {
      await deleteJournalMutation.mutateAsync(journal.id);
      router.push("/app/journals");
    } catch (cause) {
      throw new Error(getDeleteErrorMessage(cause));
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 data-open:bg-accent"
            />
          }
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Journal actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 overflow-hidden rounded-lg"
          align="end"
        >
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setIsAlertOpen(true);
            }}
          >
            <Trash2Icon />
            <span>Remove journal</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <span className="text-muted-foreground">Read-only MVP</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmTitleDeleteDialog
        open={isAlertOpen}
        onOpenChange={setIsAlertOpen}
        confirmationTitle={journal.title}
        inputId="delete-journal-title"
        title="Remove journal?"
        description="Type the exact journal title before removing it permanently."
        actionLabel="Remove"
        errorMessage={journalDeletionFailedMessage}
        onDelete={handleDelete}
      />
    </div>
  );
}
