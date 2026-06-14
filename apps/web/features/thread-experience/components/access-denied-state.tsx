"use client";

import {
  panelComposerPaddingClass,
  threadTranscriptColumnClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";

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
