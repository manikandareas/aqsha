"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { ArrowLeftIcon, ArrowRight, Loader2Icon } from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { Button } from "@/components/ui/button";
import { useConvexQueryData } from "@/lib/convex-query";
import { OnboardingLayout } from "../components/onboarding-layout";
import { OnboardingStepIndicator } from "../components/onboarding-step-indicator";
import {
  BackgroundStep,
  FinishStep,
  InterestsStep,
  SourceStep,
  WelcomeStep,
} from "../components/onboarding-steps";
import {
  type OnboardingStep,
  useOnboardingFlow,
} from "../lib/use-onboarding-flow";

const HOME_AFTER_ONBOARDING = "/app/explore";

const STEP_LABEL: Partial<Record<OnboardingStep, string>> = {
  background: "Latar belakang",
  interests: "Minat",
  source: "Sumber",
};

const PRIMARY_LABEL: Record<OnboardingStep, string> = {
  welcome: "Mulai",
  background: "Lanjut",
  interests: "Lanjut",
  source: "Selesai",
  finish: "Mulai jelajah",
};

const BACK_TARGET: Partial<Record<OnboardingStep, OnboardingStep>> = {
  background: "welcome",
  interests: "background",
  source: "interests",
};

export function OnboardingPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const flow = useOnboardingFlow();
  const {
    step,
    setStep,
    answers,
    setBackground,
    toggleInterest,
    setSource,
    setSourceOther,
    isStepValid,
    submit,
    isSubmitting,
    errorMessage,
    questionIndex,
    totalQuestions,
  } = flow;

  const status = useConvexQueryData(api.onboarding.getStatus, {});

  // Only relevant at mount: bounce an already-onboarded user who lands here
  // directly. Once the flow advances past "welcome", status is ignored — so a
  // "completed" flipping true after submit can't skip the finish screen.
  useEffect(() => {
    if (step === "welcome" && status?.completed) {
      router.replace(HOME_AFTER_ONBOARDING);
    }
  }, [status, step, router]);

  const handleBack = useCallback(() => {
    const target = BACK_TARGET[step];
    if (target) setStep(target);
  }, [step, setStep]);

  const handlePrimary = useCallback(async () => {
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
        const ok = await submit();
        if (ok) setStep("finish");
        return;
      }
      case "finish":
        router.replace(HOME_AFTER_ONBOARDING);
        return;
    }
  }, [step, submit, setStep, router]);

  const isQuestionStep = questionIndex >= 0;
  const canPrimary =
    !isSubmitting && (!isQuestionStep || isStepValid(step));

  // At mount, wait for status before showing "welcome" — avoids flashing the
  // wizard to an already-onboarded user we're about to redirect away.
  if (step === "welcome" && (!status || status.completed)) {
    return (
      <OnboardingLayout>
        <div className="flex justify-center text-muted-foreground">
          <Loader2Icon className="size-5 animate-spin" />
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      {isQuestionStep ? (
        <OnboardingStepIndicator
          index={questionIndex + 1}
          total={totalQuestions}
          label={STEP_LABEL[step] ?? ""}
        />
      ) : (
        <div className="mb-8 h-5" />
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canPrimary) void handlePrimary();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {step === "welcome" ? <WelcomeStep /> : null}
            {step === "background" ? (
              <BackgroundStep value={answers.background} onSelect={setBackground} />
            ) : null}
            {step === "interests" ? (
              <InterestsStep value={answers.interests} onToggle={toggleInterest} />
            ) : null}
            {step === "source" ? (
              <SourceStep
                value={answers.source}
                other={answers.sourceOther}
                onSelect={setSource}
                onOtherChange={setSourceOther}
              />
            ) : null}
            {step === "finish" ? <FinishStep answers={answers} /> : null}
          </m.div>
        </AnimatePresence>

        {errorMessage ? (
          <p className="mt-4 text-sm text-destructive">{errorMessage}</p>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          {BACK_TARGET[step] ? (
            <Button type="button" variant="ghost" onClick={handleBack}>
              <ArrowLeftIcon className="size-4" />
              Kembali
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!canPrimary} className="h-11 px-6">
            {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {PRIMARY_LABEL[step]}
            {!isSubmitting && step !== "finish" ? (
              <ArrowRight className="size-4" />
            ) : null}
          </Button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
