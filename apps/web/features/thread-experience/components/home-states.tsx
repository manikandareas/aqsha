"use client";

import {
  panelComposerPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { RateStatus } from "../types";
import type {
  DraftContextArtifact,
  StartThread,
  ThreadSummary,
} from "./component-types";
import { ComposerHeroState } from "./composer-hero-state";
import { Composer } from "./composer";

const HOME_EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function HomeStartState({
  rateStatus,
  startThread,
  threads,
  contextArtifacts,
  onRemoveContextArtifact,
}: {
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  threads: ThreadSummary[];
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <motion.div
          className="w-full max-w-2xl"
          initial={
            shouldReduceMotion
              ? { opacity: 0 }
              : { opacity: 0, transform: "translateY(10px) scale(0.985)" }
          }
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
          transition={{
            duration: shouldReduceMotion ? 0.14 : 0.24,
            ease: HOME_EASE_OUT,
          }}
        >
          <ComposerHeroState
            headerClassName="mb-8 gap-2.5"
            logoClassName="size-12 sm:size-22"
            titleClassName="font-sans text-2xl font-bold tracking-tight text-foreground sm:text-3xl leading-none"
          >
            <Composer
              mode="draft"
              variant="hero"
              disabled={false}
              rateStatus={rateStatus}
              onStartThread={startThread}
              threads={threads}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              showSuggestions
            />
          </ComposerHeroState>
        </motion.div>
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
      <div
        className={cn("border-t bg-background/85", panelComposerPaddingClass)}
      >
        <div className={threadTranscriptColumnClass}>
          <Composer mode="disabled" disabled rateStatus={undefined} />
        </div>
      </div>
    </div>
  );
}
