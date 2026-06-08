"use client";

import { SparklesIcon } from "@aqsha/ui/icons";
import { Input } from "@/components/ui/input";
import {
  BACKGROUND_OPTIONS,
  INTEREST_OPTIONS,
  MIN_INTERESTS,
  type OnboardingOption,
  SOURCE_OPTIONS,
  SOURCE_OTHER,
} from "../lib/onboarding-options";
import type { OnboardingAnswers } from "../lib/use-onboarding-flow";
import { InterestChip, SelectableOption } from "./onboarding-controls";

// Randomized once per page load (outside render to keep components pure) to
// reduce position/anchoring bias, with "Lainnya" pinned last since picking it
// is an explicit override of the offered options. SourceStep is never
// server-rendered (the page shows a loader until status resolves), so the
// module-scope randomness can't cause a hydration mismatch.
const SHUFFLED_SOURCES: OnboardingOption[] = (() => {
  const shuffled = [...SOURCE_OPTIONS];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [...shuffled, SOURCE_OTHER];
})();

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

export function WelcomeStep() {
  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-[2rem]">
        Kenalan dulu, yuk
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Tiga pertanyaan singkat supaya Aqsha bisa menyesuaikan riset dan feed
        buat kamu. Cuma butuh sekitar 1 menit.
      </p>
    </div>
  );
}

export function BackgroundStep({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Kamu saat ini..."
        subtitle="Biar kami tahu cara terbaik menemanimu."
      />
      <div className="grid gap-2.5">
        {BACKGROUND_OPTIONS.map((option) => (
          <SelectableOption
            key={option.id}
            selected={value === option.id}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </SelectableOption>
        ))}
      </div>
    </div>
  );
}

export function InterestsStep({
  value,
  onToggle,
}: {
  value: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Bidang apa yang kamu minati?"
        subtitle={`Pilih minimal ${MIN_INTERESTS}. Ini langsung membentuk feed Jelajah kamu.`}
      />
      <div className="flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map((option) => (
          <InterestChip
            key={option.id}
            selected={value.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            {option.label}
          </InterestChip>
        ))}
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        {value.length} dipilih
      </p>
    </div>
  );
}

export function SourceStep({
  value,
  other,
  onSelect,
  onOtherChange,
}: {
  value: string | null;
  other: string;
  onSelect: (id: string) => void;
  onOtherChange: (value: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="Dari mana kamu tahu Aqsha?"
        subtitle="Membantu kami tahu cara orang menemukan Aqsha."
      />
      <div className="grid gap-2.5">
        {SHUFFLED_SOURCES.map((option) => (
          <SelectableOption
            key={option.id}
            selected={value === option.id}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </SelectableOption>
        ))}
      </div>
      {value === SOURCE_OTHER.id ? (
        <Input
          autoFocus
          value={other}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder="Ceritakan dari mana, ya"
          className="mt-3 h-11 rounded-xl px-3.5 text-sm"
        />
      ) : null}
    </div>
  );
}

export function FinishStep({ answers }: { answers: OnboardingAnswers }) {
  return (
    <div>
      <span className="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <SparklesIcon className="size-5" />
      </span>
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
        Siap! Feed kamu sudah disesuaikan
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {answers.interests.length} bidang minat tersimpan. Selamat datang di
        Aqsha — yuk mulai jelajahi riset yang relevan buat kamu.
      </p>
    </div>
  );
}
