"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { readableApiErrorMessage } from "@/lib/api-error";
import { useApi } from "@/lib/api-client";
import { unwrap } from "@/lib/api-query";
import { MIN_INTERESTS, SOURCE_OTHER } from "./onboarding-options";

const ONBOARDING_STEPS = ["welcome", "background", "interests", "source", "finish"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const QUESTION_STEPS: OnboardingStep[] = ["background", "interests", "source"];

export type OnboardingAnswers = {
  background: string | null;
  interests: string[];
  source: string | null;
  sourceOther: string;
};

export function useOnboardingFlow() {
  const api = useApi();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    background: null,
    interests: [],
    source: null,
    sourceOther: "",
  });

  const complete = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.onboarding.complete.post({
          background: answers.background!,
          interests: answers.interests,
          heardAboutSource: answers.source!,
          heardAboutOther:
            answers.source === SOURCE_OTHER.id ? answers.sourceOther.trim() : undefined,
        }),
      ),
  });

  const setBackground = (id: string) => setAnswers((a) => ({ ...a, background: id }));
  const toggleInterest = (id: string) =>
    setAnswers((a) => ({
      ...a,
      interests: a.interests.includes(id)
        ? a.interests.filter((x) => x !== id)
        : [...a.interests, id],
    }));
  const setSource = (id: string) => setAnswers((a) => ({ ...a, source: id }));
  const setSourceOther = (value: string) => setAnswers((a) => ({ ...a, sourceOther: value }));

  const isStepValid = (target: OnboardingStep): boolean => {
    switch (target) {
      case "background":
        return Boolean(answers.background);
      case "interests":
        return answers.interests.length >= MIN_INTERESTS;
      case "source":
        if (!answers.source) return false;
        if (answers.source === SOURCE_OTHER.id) return answers.sourceOther.trim().length > 0;
        return true;
      default:
        return true;
    }
  };

  const submit = async (): Promise<boolean> => {
    if (!answers.background || !answers.source) return false;
    try {
      await complete.mutateAsync();
      return true;
    } catch {
      return false;
    }
  };

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const errorMessage = complete.error
    ? readableApiErrorMessage(complete.error, "Belum bisa menyimpan. Coba lagi, ya.")
    : null;

  return {
    step,
    setStep,
    answers,
    setBackground,
    toggleInterest,
    setSource,
    setSourceOther,
    isStepValid,
    submit,
    isSubmitting: complete.isPending,
    errorMessage,
    questionIndex,
    totalQuestions: QUESTION_STEPS.length,
  };
}
