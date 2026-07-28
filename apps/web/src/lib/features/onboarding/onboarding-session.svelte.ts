import {
	EMPTY_ANSWERS,
	type OnboardingAnswers,
	type OnboardingStep,
	toggleInterest as toggleInterestPure
} from './lib/onboarding-machine';
import type { JourneySession } from './lib/journey-driver';

/** Shared step + answers store for production flow and design-lab session. */
export type OnboardingSessionCore = {
	readonly step: OnboardingStep;
	setStep(next: OnboardingStep): void;
	readonly answers: OnboardingAnswers;
	setBackground(id: string): void;
	toggleInterest(id: string): void;
	setSource(id: string): void;
	setSourceOther(value: string): void;
	reset(): void;
};

export function createOnboardingSession(): OnboardingSessionCore {
	let step = $state<OnboardingStep>('welcome');
	let answers = $state<OnboardingAnswers>({ ...EMPTY_ANSWERS });

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
		reset() {
			step = 'welcome';
			answers = { ...EMPTY_ANSWERS };
		}
	};
}

/** Bind live status getters onto a core session without snapshotting via Object.assign. */
export function asJourneySession(
	session: OnboardingSessionCore,
	status: {
		readonly isSubmitting: boolean;
		readonly errorMessage: string | null;
	}
): JourneySession {
	return {
		get step() {
			return session.step;
		},
		setStep(next) {
			session.setStep(next);
		},
		get answers() {
			return session.answers;
		},
		setBackground(id) {
			session.setBackground(id);
		},
		toggleInterest(id) {
			session.toggleInterest(id);
		},
		setSource(id) {
			session.setSource(id);
		},
		setSourceOther(value) {
			session.setSourceOther(value);
		},
		get isSubmitting() {
			return status.isSubmitting;
		},
		get errorMessage() {
			return status.errorMessage;
		}
	};
}
