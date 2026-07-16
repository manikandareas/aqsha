// Presentation contract for OnboardingJourney: one model + one actions object so drivers
// (production page, design lab) do not spread a callback bag across the shell.

import type { OnboardingAnswers, OnboardingStep } from './onboarding-machine';

export type JourneyViewModel = {
	step: OnboardingStep;
	answers: OnboardingAnswers;
	isSubmitting: boolean;
	errorMessage: string | null;
	canPrimary: boolean;
};

export type JourneyActions = {
	back: () => void;
	primary: () => void;
	setBackground: (id: string) => void;
	toggleInterest: (id: string) => void;
	setSource: (id: string) => void;
	setSourceOther: (value: string) => void;
};
