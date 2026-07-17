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

function stepIndex(step: OnboardingStep): number {
	return ONBOARDING_STEPS.indexOf(step);
}

/** Next step in the journey, or undefined on the terminal step. */
export function advanceStep(step: OnboardingStep): OnboardingStep | undefined {
	const index = stepIndex(step);
	if (index < 0 || index >= ONBOARDING_STEPS.length - 1) return undefined;
	return ONBOARDING_STEPS[index + 1];
}

/** Previous step in the journey, or undefined when there is no back target. */
export function backStep(step: OnboardingStep): OnboardingStep | undefined {
	const index = stepIndex(step);
	if (index <= 0) return undefined;
	return ONBOARDING_STEPS[index - 1];
}

export const PRIMARY_LABEL: Record<OnboardingStep, string> = {
	welcome: 'Mulai dari satu ide',
	background: 'Lanjut',
	interests: 'Lanjut',
	source: 'Lanjut',
	finish: 'Mulai research'
};

/**
 * What the primary button means on this step. `advance` is a pure step change via advanceStep;
 * the terminal step (finish, "Mulai research") is `submit` — drivers post the answers and, on
 * success, navigate to the app.
 */
export type PrimaryIntent = { type: 'advance'; step: OnboardingStep } | { type: 'submit' };

export function primaryIntent(step: OnboardingStep): PrimaryIntent {
	const next = advanceStep(step);
	if (next) return { type: 'advance', step: next };
	return { type: 'submit' };
}

export function isQuestionStep(step: OnboardingStep): boolean {
	return QUESTION_STEPS.has(step);
}

/** Every question step must be valid before finish can submit. */
export function isAnswersComplete(answers: OnboardingAnswers): boolean {
	for (const step of QUESTION_STEPS) {
		if (!isStepValid(step, answers)) return false;
	}
	return true;
}

/** Primary enabled when not submitting and the current step's gate passes. */
export function canPrimary(
	step: OnboardingStep,
	answers: OnboardingAnswers,
	isSubmitting: boolean
): boolean {
	if (isSubmitting) return false;
	if (step === 'finish') return isAnswersComplete(answers);
	if (isQuestionStep(step)) return isStepValid(step, answers);
	return true;
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
 * "lainnya". Returns null when any question step is still invalid.
 */
export function buildCompletePayload(answers: OnboardingAnswers): {
	background: string;
	interests: string[];
	heardAboutSource: string;
	heardAboutOther: string | undefined;
} | null {
	if (!isAnswersComplete(answers) || !answers.background || !answers.source) return null;
	return {
		background: answers.background,
		interests: answers.interests,
		heardAboutSource: answers.source,
		heardAboutOther: answers.source === SOURCE_OTHER.id ? answers.sourceOther.trim() : undefined
	};
}
