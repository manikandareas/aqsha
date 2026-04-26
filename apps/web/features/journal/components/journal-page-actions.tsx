"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { MoreHorizontalIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/eden";
import type { JournalRecord } from "@/features/journal/lib/journals";

type EdenErrorValue = {
  error?: {
    message?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDeleteErrorMessage(error: unknown): string {
  if (isObject(error) && "value" in error) {
    const value = error.value;

    if (isObject(value)) {
      const apiError = (value as EdenErrorValue).error;

      if (isObject(apiError) && typeof apiError.message === "string") {
        return apiError.message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Journal deletion failed. Try again.";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Edit";
  }

  return `Edit ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
  }).format(date)}`;
}

type DeleteJournalFormValues = {
  confirmationTitle: string;
};

export function JournalPageActions({ journal }: { journal: JournalRecord }) {
  const router = useRouter();
  const [isAlertOpen, setIsAlertOpen] = React.useState(false);
  const deleteForm = useForm<DeleteJournalFormValues>({
    resolver: zodResolver(
      z.object({
        confirmationTitle: z.literal(journal.title, {
          error: "Type the journal title exactly.",
        }),
      }),
    ),
    defaultValues: {
      confirmationTitle: "",
    },
  });

  const confirmationTitle = useWatch({
    control: deleteForm.control,
    name: "confirmationTitle",
  });
  const canDelete =
    confirmationTitle === journal.title && !deleteForm.formState.isSubmitting;
  const error =
    deleteForm.formState.errors.confirmationTitle?.message ??
    deleteForm.formState.errors.root?.message;

  async function handleDelete(): Promise<void> {
    deleteForm.clearErrors("root");

    try {
      const response = await api.journals({ id: journal.id }).delete();

      if (response.error) {
        deleteForm.setError("root", {
          message: getDeleteErrorMessage(response.error),
        });
        return;
      }

      window.dispatchEvent(new Event("journals:changed"));
      setIsAlertOpen(false);
      deleteForm.reset();
      router.push("/app");
      router.refresh();
    } catch (cause) {
      deleteForm.setError("root", {
        message: getDeleteErrorMessage(cause),
      });
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden font-medium text-muted-foreground md:inline-block">
        {formatUpdatedAt(journal.updatedAt)}
      </div>
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

      <AlertDialog
        open={isAlertOpen}
        onOpenChange={(open) => {
          setIsAlertOpen(open);

          if (!open) {
            deleteForm.reset();
            deleteForm.clearErrors();
          }
        }}
      >
        <AlertDialogContent>
          <form
            onSubmit={deleteForm.handleSubmit(handleDelete)}
            className="contents"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Remove journal?</AlertDialogTitle>
              <AlertDialogDescription>
                Type the exact journal title before removing it permanently.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="delete-journal-title">{journal.title}</Label>
              <Input
                id="delete-journal-title"
                {...deleteForm.register("confirmationTitle", {
                  onChange: () => deleteForm.clearErrors("root"),
                })}
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteForm.formState.isSubmitting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                variant="destructive"
                disabled={!canDelete}
              >
                {deleteForm.formState.isSubmitting ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
