"use client";

import { ArrowUpRightIcon, CompassIcon, Loader2Icon } from "@aqsha/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IdeasResult } from "../api";

/**
 * Pembuat ide riset (Fase 8) — presentational. Generation dipicu di handler page
 * (onGenerateIdeas → useIdeas.mutate), bukan effect-on-open. Pilih satu pertanyaan
 * → `onLaunch(question)` (page → /deep). Kuota habis → notice.
 */
export function IdeaDialog({
  seedTitle,
  open,
  onOpenChange,
  pending,
  isError,
  result,
  onLaunch,
}: {
  seedTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  isError: boolean;
  result?: IdeasResult;
  onLaunch: (question: string) => void;
}) {
  const blocked = result && !result.ok;
  const questions = result && result.ok ? result.ideas : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CompassIcon className="size-4" /> Cari celah riset
          </DialogTitle>
          <DialogDescription>
            {seedTitle ? `Dari “${seedTitle}”` : "Pertanyaan riset yang bisa langsung diteliti."}
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Menyusun pertanyaan…
          </div>
        ) : blocked ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Kuota AI bulan ini sudah habis. Tingkatkan paket atau tunggu reset.
          </p>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">Gagal menyusun ide. Coba lagi.</p>
        ) : (
          <ul className="grid gap-2">
            {questions.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => onLaunch(question)}
                  className="group flex w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-foreground/25 hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-foreground">{question}</span>
                  <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
