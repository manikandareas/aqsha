import {
	EMPTY_ANSWERS,
	type OnboardingAnswers,
	type OnboardingStep,
	toggleInterest as toggleInterestPure
} from './lib/onboarding-machine';
import type { JourneySession } from './lib/journey-driver';

/**
 * Local-only journey session for the design lab: same JourneySession surface as the production
 * flow, without status query or complete mutation. Submit is simulated by the lab driver.
 */
export function createLocalOnboardingSession(): JourneySession & {
	beginSubmit(): void;
	reset(): void;
} {
	let step = $state<OnboardingStep>('welcome');
	let answers = $state<OnboardingAnswers>({ ...EMPTY_ANSWERS });
	let isSubmitting = $state(false);

	return {
		get step() {
			return step;
		},
		setStep(next: OnboardingStep) {
			step = next;
		},
		get answers() {
			return answers;
		},
		setBackground(id: string) {
			answers = { ...answers, background: id };
		},
		toggleInterest(id: string) {
			answers = { ...answers, interests: toggleInterestPure(answers.interests, id) };
		},
		setSource(id: string) {
			answers = { ...answers, source: id };
		},
		setSourceOther(value: string) {
			answers = { ...answers, sourceOther: value };
		},
		get isSubmitting() {
			return isSubmitting;
		},
		get errorMessage(): string | null {
			return null;
		},
		beginSubmit() {
			isSubmitting = true;
		},
		reset() {
			isSubmitting = false;
			step = 'welcome';
			answers = { ...EMPTY_ANSWERS };
		}
	};
}
