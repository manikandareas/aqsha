"use client";

import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import {
  panelComposerPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type { RateStatus } from "../types";
import type { DraftContextArtifact, StartThread } from "./component-types";
import { ComposerHeroState } from "./composer-hero-state";
import { Composer } from "./composer";
import { applySuggestion } from "./shared";

export function HomeStartState({
  rateStatus,
  startThread,
  contextArtifacts,
  onRemoveContextArtifact,
}: {
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
}) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-2xl">
          <ComposerHeroState
            headerClassName="mb-8 gap-2.5"
            logoClassName="size-8 text-mint"
            titleClassName="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl leading-none"
          >
            <Composer
              mode="draft"
              variant="hero"
              disabled={false}
              rateStatus={rateStatus}
              onStartThread={startThread}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
            />
          </ComposerHeroState>
        </div>
      </div>
    </main>
  );
}

export function EmptyThreadCopy({ title }: { title?: string }) {
  return (
    <div className="grid flex-1 place-items-center py-16 text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-lavender">
          quiet desk, clear artifacts
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-[28px] font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
        <Suggestions className="mx-auto max-w-full justify-center">
          <Suggestion
            suggestion="Cari sumber tentang dampak AI pada pembelajaran mandiri."
            onClick={applySuggestion}
            className="border-mint-soft-border bg-mint-soft text-mint-foreground hover:bg-mint-soft"
          >
            Cari sumber tentang…
          </Suggestion>
          <Suggestion
            suggestion="Buat ringkasan literatur tentang retrieval augmented generation untuk pendidikan."
            onClick={applySuggestion}
            className="border-sky-soft-border bg-sky-soft text-sky-foreground hover:bg-sky-soft"
          >
            Buat ringkasan literatur…
          </Suggestion>
          <Suggestion
            suggestion="Bandingkan dua teori belajar konstruktivisme dan connectivism dengan sumber akademik."
            onClick={applySuggestion}
            className="border-lavender-soft-border bg-lavender-soft text-lavender-foreground hover:bg-lavender-soft"
          >
            Bandingkan dua teori…
          </Suggestion>
        </Suggestions>
      </div>
    </div>
  );
}

export function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <div className={cn("border-t bg-background/85", panelComposerPaddingClass)}>
        <div className={threadTranscriptColumnClass}>
          <Composer mode="disabled" disabled rateStatus={undefined} />
        </div>
      </div>
    </div>
  );
}
