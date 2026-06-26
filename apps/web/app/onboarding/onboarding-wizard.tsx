"use client";

import { Button } from "@aqsha/ui/components/button";
import { ArrowLeftIcon, ArrowRight, CheckIcon, Loader2Icon, SparklesIcon } from "@aqsha/ui/icons";
import { Input } from "@aqsha/ui/components/input";
import { cn } from "@aqsha/ui/lib/cn";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import {
  BACKGROUND_OPTIONS,
  INTEREST_OPTIONS,
  MIN_INTERESTS,
  type OnboardingOption,
  SOURCE_OPTIONS,
  SOURCE_OTHER,
} from "./options";

type Step = "welcome" | "background" | "interests" | "source" | "finish";
const QUESTION_STEPS: Step[] = ["background", "interests", "source"];
const BACK_TARGET: Partial<Record<Step, Step>> = {
  background: "welcome",
  interests: "background",
  source: "interests",
};
const PRIMARY_LABEL: Record<Step, string> = {
  welcome: "Mulai",
  background: "Lanjut",
  interests: "Lanjut",
  source: "Selesai",
  finish: "Mulai jelajah",
};

function SelectableOption({
  option,
  selected,
  onSelect,
}: {
  option: OnboardingOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-input hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span>{option.label}</span>
      {selected ? <CheckIcon className="size-4 text-primary" /> : null}
    </button>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const api = useApi();

  const [step, setStep] = useState<Step>("welcome");
  const [background, setBackground] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [sourceOther, setSourceOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleInterest = (id: string) =>
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const isStepValid = (target: Step): boolean => {
    switch (target) {
      case "background":
        return Boolean(background);
      case "interests":
        return interests.length >= MIN_INTERESTS;
      case "source":
        if (!source) return false;
        if (source === SOURCE_OTHER.id) return sourceOther.trim().length > 0;
        return true;
      default:
        return true;
    }
  };

  const submit = async (): Promise<boolean> => {
    if (!background || !source) return false;
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await api.onboarding.complete.post({
      background,
      interests,
      heardAboutSource: source,
      heardAboutOther: source === SOURCE_OTHER.id ? sourceOther.trim() : undefined,
    });
    setSubmitting(false);
    if (error) {
      setErrorMessage(readableApiErrorMessage(error, "Belum bisa menyimpan. Coba lagi, ya."));
      return false;
    }
    return true;
  };

  const handlePrimary = async () => {
    switch (step) {
      case "welcome":
        setStep("background");
        return;
      case "background":
        setStep("interests");
        return;
      case "interests":
        setStep("source");
        return;
      case "source": {
        if (await submit()) setStep("finish");
        return;
      }
      case "finish":
        router.push("/app");
        router.refresh();
        return;
    }
  };

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const isQuestionStep = questionIndex >= 0;
  const canPrimary = !submitting && (!isQuestionStep || isStepValid(step));
  const backTarget = BACK_TARGET[step];

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center px-6 py-12">
      {/* Indikator langkah kustom (tanpa komponen Progress) */}
      {isQuestionStep ? (
        <div className="mb-8 flex items-center gap-2" aria-label={`Langkah ${questionIndex + 1} dari ${QUESTION_STEPS.length}`}>
          {QUESTION_STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= questionIndex ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="mb-8 h-1.5" />
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canPrimary) void handlePrimary();
        }}
      >
        {step === "welcome" ? (
          <div className="space-y-3">
            <SparklesIcon className="size-7 text-primary" />
            <h1 className="font-serif text-3xl">Selamat datang di Aqsha</h1>
            <p className="text-muted-foreground">
              Sesuaikan Aqsha dengan minat dan latar belakangmu dalam satu menit. Jawabanmu membantu
              kami menyiapkan bacaan yang relevan.
            </p>
          </div>
        ) : null}

        {step === "background" ? (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl">Apa latar belakangmu?</h2>
            <div className="grid gap-2">
              {BACKGROUND_OPTIONS.map((option) => (
                <SelectableOption
                  key={option.id}
                  option={option}
                  selected={background === option.id}
                  onSelect={() => setBackground(option.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === "interests" ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl">Bidang apa yang kamu minati?</h2>
              <p className="text-sm text-muted-foreground">Pilih minimal {MIN_INTERESTS} bidang.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => {
                const selected = interests.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleInterest(option.id)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-input hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "source" ? (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl">Dari mana kamu tahu Aqsha?</h2>
            <div className="grid gap-2">
              {SOURCE_OPTIONS.map((option) => (
                <SelectableOption
                  key={option.id}
                  option={option}
                  selected={source === option.id}
                  onSelect={() => setSource(option.id)}
                />
              ))}
              <SelectableOption
                option={SOURCE_OTHER}
                selected={source === SOURCE_OTHER.id}
                onSelect={() => setSource(SOURCE_OTHER.id)}
              />
              {source === SOURCE_OTHER.id ? (
                <Input
                  autoFocus
                  value={sourceOther}
                  onChange={(event) => setSourceOther(event.target.value)}
                  placeholder="Tulis dari mana kamu tahu Aqsha"
                  className="mt-1"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {step === "finish" ? (
          <div className="space-y-3 text-center">
            <CheckIcon className="mx-auto size-8 text-primary" />
            <h2 className="font-serif text-2xl">Semua siap!</h2>
            <p className="text-muted-foreground">
              Aqsha sudah disesuaikan dengan minatmu. Selamat menjelajah.
            </p>
          </div>
        ) : null}

        {errorMessage ? <p className="mt-4 text-sm text-destructive">{errorMessage}</p> : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          {backTarget ? (
            <Button type="button" variant="ghost" onClick={() => setStep(backTarget)}>
              <ArrowLeftIcon className="size-4" />
              Kembali
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={!canPrimary}>
            {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {PRIMARY_LABEL[step]}
            {!submitting && step !== "finish" ? <ArrowRight className="size-4" /> : null}
          </Button>
        </div>
      </form>
    </main>
  );
}
