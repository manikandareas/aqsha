"use client";

import { ArrowRightIcon } from "@aqsha/ui/icons";
import { useSetComposerDraft } from "@/features/thread-experience/components/composer-context-mentions";
import { statsNextStepsFor } from "../../lib/stats-next-steps";

/**
 * Chip next-step ritual (fase C plan statistik-panel) — tuntunan urutan uji SKILL.md, dirender di
 * bawah transkrip HANYA pada run analisis TERAKHIR + turn settled (lihat `MessageList`). Tap = prefill
 * composer via `useSetComposerDraft` (channel `ComposerMentionsProvider`), TANPA auto-send. Uji tanpa
 * saran (custom / Tier 3) → `statsNextStepsFor` kosong → komponen tak render apa pun.
 */
export function StatsNextStepChips({ analysis }: { analysis: string }) {
  const steps = statsNextStepsFor(analysis);
  const setComposerDraft = useSetComposerDraft();
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <span className="text-[11px] text-muted-foreground">Langkah berikutnya</span>
      {steps.map((step) => (
        <button
          key={step.label}
          type="button"
          onClick={() => setComposerDraft(step.prompt)}
          className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-medium text-[11px] text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={step.prompt}
        >
          {step.label}
          <ArrowRightIcon className="size-3" />
        </button>
      ))}
    </div>
  );
}
