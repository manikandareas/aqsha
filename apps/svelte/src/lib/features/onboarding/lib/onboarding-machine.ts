// Pure onboarding step machine. No runes, no imports beyond options: framework-agnostic +
// unit-testable. The Svelte state layer (`state.svelte.ts`) and drivers bind UI from these
// constants + predicates for validation timing and back/next targets.

import { MIN_INTERESTS, SOURCE_OTHER } from './onboarding-options';

export const ONBOARDING_STEPS = ['welcome', 'background', 'interests', 'source', 'finish'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps that require a valid answer before the primary button advances. */
const QUESTION_STEPS = new Set<OnboardingStep>(['background', 'interests', 'source']);

export type OnboardingAnswers = {
	background: string | null;
	interests: string[];
	source: string | null;
	sourceOther: string;
};

export const EMPTY_ANSWERS: OnboardingAnswers = {
	background: null,
	interests: [],
	source: null,
	sourceOther: ''
};

export const HOME_AFTER_ONBOARDING = '/app';

/** Where the "Kembali" button goes per step. Absent → no back button. */
export const BACK_TARGET: Partial<Record<OnboardingStep, OnboardingStep>> = {
	background: 'welcome',
	interests: 'background',
	source: 'interests',
	finish: 'source'
};

export const PRIMARY_LABEL: Record<OnboardingStep, string> = {
	welcome: 'Mulai dari satu ide',
	background: 'Lanjut',
	interests: 'Lanjut',
	source: 'Lanjut',
	finish: 'Mulai research'
};

/** The non-submit forward transition (welcome→background→interests→source→finish). */
export const ADVANCE_TARGET: Partial<Record<OnboardingStep, OnboardingStep>> = {
	welcome: 'background',
	background: 'interests',
	interests: 'source',
	source: 'finish'
};

/**
 * What the primary button means on this step. `advance` is a pure step change via ADVANCE_TARGET;
 * the terminal step (finish, "Mulai research") is `submit` — drivers post the answers and, on
 * success, navigate to the app.
 */
export type PrimaryIntent = { type: 'advance'; step: OnboardingStep } | { type: 'submit' };

export function primaryIntent(step: OnboardingStep): PrimaryIntent {
	const next = ADVANCE_TARGET[step];
	if (next) return { type: 'advance', step: next };
	return { type: 'submit' };
}

export function isQuestionStep(step: OnboardingStep): boolean {
	return QUESTION_STEPS.has(step);
}

/** Primary enabled when not submitting and the current question (if any) is valid. */
export function canPrimary(
	step: OnboardingStep,
	answers: OnboardingAnswers,
	isSubmitting: boolean
): boolean {
	return !isSubmitting && (!isQuestionStep(step) || isStepValid(step, answers));
}

/** Can the primary button advance from this step given the current answers? */
export function isStepValid(step: OnboardingStep, answers: OnboardingAnswers): boolean {
	switch (step) {
		case 'background':
			return Boolean(answers.background);
		case 'interests':
			return answers.interests.length >= MIN_INTERESTS;
		case 'source':
			if (!answers.source) return false;
			if (answers.source === SOURCE_OTHER.id) return answers.sourceOther.trim().length > 0;
			return true;
		default:
			return true;
	}
}

/** Toggle an interest id in/out of the selection (pure). */
export function toggleInterest(interests: string[], id: string): string[] {
	return interests.includes(id) ? interests.filter((x) => x !== id) : [...interests, id];
}

/**
 * Build the `onboarding.complete` request body. `heardAboutOther` is sent only when source is
 * "lainnya". Returns null when required single-selects are missing (submit is a no-op).
 */
export function buildCompletePayload(answers: OnboardingAnswers): {
	background: string;
	interests: string[];
	heardAboutSource: string;
	heardAboutOther: string | undefined;
} | null {
	if (!answers.background || !answers.source) return null;
	return {
		background: answers.background,
		interests: answers.interests,
		heardAboutSource: answers.source,
		heardAboutOther: answers.source === SOURCE_OTHER.id ? answers.sourceOther.trim() : undefined
	};
}
