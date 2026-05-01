"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ConfirmTitleDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmationTitle: string;
  inputId: string;
  title: string;
  description: string;
  actionLabel: string;
  errorMessage: string;
  onDelete: () => Promise<void>;
};

type ConfirmTitleDeleteFormValues = {
  confirmationTitle: string;
};

export function ConfirmTitleDeleteDialog({
  open,
  onOpenChange,
  confirmationTitle,
  inputId,
  title,
  description,
  actionLabel,
  errorMessage,
  onDelete,
}: ConfirmTitleDeleteDialogProps) {
  const form = useForm<ConfirmTitleDeleteFormValues>({
    resolver: zodResolver(
      z.object({
        confirmationTitle: z.literal(confirmationTitle, {
          error: `Type ${confirmationTitle} exactly.`,
        }),
      }),
    ),
    defaultValues: {
      confirmationTitle: "",
    },
  });
  const typedTitle = useWatch({
    control: form.control,
    name: "confirmationTitle",
  });
  const canDelete =
    typedTitle === confirmationTitle && !form.formState.isSubmitting;
  const error =
    form.formState.errors.confirmationTitle?.message ??
    form.formState.errors.root?.message;

  async function handleDelete(): Promise<void> {
    form.clearErrors("root");

    try {
      await onDelete();
      onOpenChange(false);
      form.reset();
    } catch (cause) {
      form.setError("root", {
        message: cause instanceof Error ? cause.message : errorMessage,
      });
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);

        if (!nextOpen) {
          form.reset();
          form.clearErrors();
        }
      }}
    >
      <AlertDialogContent>
        <form onSubmit={form.handleSubmit(handleDelete)} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{confirmationTitle}</Label>
            <Input
              id={inputId}
              {...form.register("confirmationTitle", {
                onChange: () => form.clearErrors("root"),
              })}
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={form.formState.isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              disabled={!canDelete}
            >
              {form.formState.isSubmitting ? (
                <Loader2Icon className="animate-spin" />
              ) : null}
              {actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
