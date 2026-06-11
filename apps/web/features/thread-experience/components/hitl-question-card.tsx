"use client";

import { CornerDownLeftIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  hitlCardBodyClass,
  hitlCardFooterClass,
  hitlCardHeaderClass,
  hitlCardShellClass,
} from "./hitl-card-layout";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Blends freeform inputs with preset option label rows (no boxed chrome). */
const hitlQuestionCustomInputClass =
  "border-0 bg-transparent py-0.5 text-[11px] leading-snug text-foreground/90 outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0";

type HitlOption = { id: string; label: string };

function isOtherOptionId(id: string) {
  return id === "other" || id === "custom" || id.endsWith("_other");
}

/** UI for agent `askUser` tool — Questions card */
export function HitlQuestionCard({
  prompt,
  options,
  allowCustom = true,
  disabled,
  questionIndex,
  questionTotal,
  onContinue,
  onSkip,
  onBack,
}: {
  prompt: string;
  options: HitlOption[];
  allowCustom?: boolean;
  disabled?: boolean;
  questionIndex?: number;
  questionTotal?: number;
  onContinue: (args: { selectedOptionIds: string[]; customAnswer?: string }) => void;
  onSkip: () => void;
  /** When set with questionIndex > 1, shows a Back control to rewind within this askUser batch */
  onBack?: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAnswer, setCustomAnswer] = useState("");
  const [customFocused, setCustomFocused] = useState(false);

  const useFreeformLastSlot = Boolean(allowCustom && options.length > 0);
  const presetOptions =
    useFreeformLastSlot && options.length > 1
      ? options.slice(0, -1)
      : useFreeformLastSlot
        ? []
        : options;
  const lastOption = useFreeformLastSlot ? options[options.length - 1] : undefined;
  const lastLetterSlot =
    useFreeformLastSlot && lastOption
      ? (options.length > 1 ? options.length - 1 : 0)
      : 0;
  const lastLetter = LETTERS[lastLetterSlot] ?? "?";

  const showLegacyCustomInput =
    !useFreeformLastSlot &&
    allowCustom &&
    selectedIds.some((id) => isOtherOptionId(id));

  const continueEnabled =
    selectedIds.length > 0 || Boolean(customAnswer.trim());

  const handlePresetClick = (optionId: string) => {
    setSelectedIds([optionId]);
    setCustomAnswer("");
  };

  const handleFreeformChange = (value: string) => {
    setCustomAnswer(value);
    if (value.trim() && lastOption) {
      setSelectedIds([lastOption.id]);
    } else if (!value.trim()) {
      setSelectedIds([]);
    }
  };

  const handleContinue = () => {
    if (useFreeformLastSlot && lastOption) {
      const trimmed = customAnswer.trim();
      if (trimmed) {
        onContinue({
          selectedOptionIds: [lastOption.id],
          customAnswer: trimmed,
        });
        return;
      }
    }
    onContinue({
      selectedOptionIds: selectedIds,
      customAnswer: showLegacyCustomInput ? customAnswer.trim() || undefined : undefined,
    });
  };

  return (
    <Card
      size="sm"
      data-hitl-tool="askUser"
      className={cn("border-border/70", hitlCardShellClass)}
    >
      <CardHeader className={hitlCardHeaderClass}>
        <span className="text-[10px] font-medium text-muted-foreground">Questions</span>
      </CardHeader>
      <CardContent className={hitlCardBodyClass}>
        <p className="text-[12px] font-semibold leading-snug text-foreground">{prompt}</p>
        {presetOptions.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {presetOptions.map((option, index) => {
              const selected = selectedIds.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => handlePresetClick(option.id)}
                    className={cn(
                      "-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors",
                      selected ? "bg-muted/50" : "hover:bg-muted/30",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/20 text-[9px] font-medium text-muted-foreground">
                      {LETTERS[index] ?? "?"}
                    </span>
                    <span className="min-w-0 text-[11px] leading-snug text-foreground/90">
                      {option.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {useFreeformLastSlot && lastOption ? (
          <label
            className={cn(
              "-mx-1 flex w-[calc(100%+0.5rem)] cursor-text items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
              presetOptions.length > 0 ? "mt-1.5" : "mt-2",
              customAnswer.length > 0 ||
                customFocused ||
                selectedIds.includes(lastOption.id)
                ? "bg-muted/50"
                : !disabled && "hover:bg-muted/30",
              disabled && "pointer-events-none cursor-not-allowed opacity-60",
            )}
          >
            <span
              className="flex size-4 shrink-0 cursor-text items-center justify-center rounded border border-border/60 bg-muted/20 text-[9px] font-medium text-muted-foreground"
              aria-hidden
            >
              {lastLetter}
            </span>
            <input
              type="text"
              value={customAnswer}
              disabled={disabled}
              onChange={(event) => handleFreeformChange(event.target.value)}
              onFocus={() => {
                setCustomFocused(true);
                setSelectedIds(() => {
                  if (!lastOption) return [];
                  if (customAnswer.trim()) {
                    return [lastOption.id];
                  }
                  return [];
                });
              }}
              onBlur={() => setCustomFocused(false)}
              placeholder={lastOption.label}
              aria-label={lastOption.label}
              className={cn("min-w-0 flex-1 px-0", hitlQuestionCustomInputClass)}
            />
          </label>
        ) : null}
        {showLegacyCustomInput ? (
          <input
            type="text"
          value={customAnswer}
          disabled={disabled}
          onChange={(event) => setCustomAnswer(event.target.value)}
          aria-label="Jawaban lain"
          placeholder="Jelaskan…"
            className={cn("mt-1.5 w-full px-1", hitlQuestionCustomInputClass)}
          />
        ) : null}
      </CardContent>
      <CardFooter
        className={cn(
          hitlCardFooterClass,
          "flex flex-row flex-wrap items-center justify-between gap-1",
        )}
      >
        <div className="flex min-w-0 items-center">
          {questionIndex !== undefined && questionTotal !== undefined && questionTotal > 1 ? (
            <span className="text-[10px] text-muted-foreground">
              Pertanyaan {questionIndex} dari {questionTotal}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onBack && questionIndex !== undefined && questionIndex > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              disabled={disabled}
              onClick={onBack}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            disabled={disabled}
            onClick={onSkip}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 gap-0.5 px-2.5 text-[11px]"
            disabled={disabled || !continueEnabled}
            onClick={handleContinue}
          >
            Continue
            <CornerDownLeftIcon className="size-2.5 opacity-60" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
