"use client";

import Link from "next/link";
import { CompassIcon } from "@aqsha/ui/icons";
import {
  panelBodyPaddingClass,
  panelComposerPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "motion/react";
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
  onThreadCreated,
  contextLabel,
  compact = false,
}: {
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  threads: ThreadSummary[];
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  onThreadCreated?: (threadId: string) => void;
  contextLabel?: string;
  compact?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div
        className={cn(
          "mx-auto flex w-full flex-1 items-center justify-center",
          compact
            ? cn("max-w-none", panelBodyPaddingClass)
            : "max-w-5xl px-4 py-10 sm:px-8",
        )}
      >
        <m.div
          className={cn("w-full", compact ? "max-w-none" : "max-w-2xl")}
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
            headerClassName="mb-5 gap-2"
            logoClassName={compact ? "size-12 sm:size-18" : "size-12 sm:size-22"}
            titleClassName={cn(
              "font-sans font-bold tracking-tight text-foreground leading-none",
              compact ? "text-xl" : "text-2xl sm:text-3xl",
            )}
          >
            <Composer
              mode="draft"
              variant="hero"
              disabled={false}
              rateStatus={rateStatus}
              onStartThread={startThread}
              onThreadCreated={onThreadCreated}
              threads={threads}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              contextLabel={contextLabel}
              showSuggestions
            />
          </ComposerHeroState>
        </m.div>
      </div>
      {compact ? null : <ExploreDockLink />}
    </main>
  );
}

function ExploreDockLink() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <m.div
      className="sticky bottom-4 z-30 mx-auto flex w-full max-w-5xl justify-center px-4 pb-4 sm:bottom-5 sm:px-8 sm:pb-5"
      initial={
        shouldReduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 8, scale: 0.98 }
      }
      animate={
        shouldReduceMotion
          ? { opacity: 1 }
          : { opacity: 1, y: [0, -3, 0], scale: [1, 1.012, 1] }
      }
      transition={
        shouldReduceMotion
          ? { duration: 0.14, ease: HOME_EASE_OUT }
          : {
              opacity: { duration: 0.18, ease: HOME_EASE_OUT },
              scale: {
                duration: 2.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.35,
              },
              y: {
                duration: 2.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.35,
              },
            }
      }
    >
      <Link
        href="/app/explore"
        className="group inline-flex items-center gap-1.5 whitespace-nowrap px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground outline-none drop-shadow-[0_0_10px_color-mix(in_oklch,var(--muted-foreground)_24%,transparent)] transition-colors hover:text-foreground focus-visible:text-foreground"
        aria-label="Buka Explore"
      >
        <span className="relative">
          Temukan Inspirasi
          <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-[0.7] bg-muted-foreground opacity-35 transition-transform duration-300 ease-out group-hover:scale-x-100 group-hover:opacity-55 group-focus-visible:scale-x-100 group-focus-visible:opacity-55" />
        </span>
        <m.span
          aria-hidden="true"
          className="grid size-3.5 place-items-center text-muted-foreground"
          animate={shouldReduceMotion ? undefined : { rotate: [0, -8, 8, 0] }}
          transition={{
            duration: 3.1,
            ease: "easeInOut",
            repeat: Infinity,
            repeatDelay: 0.45,
          }}
        >
          <CompassIcon className="size-3.5" strokeWidth={2.25} />
        </m.span>
      </Link>
    </m.div>
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
