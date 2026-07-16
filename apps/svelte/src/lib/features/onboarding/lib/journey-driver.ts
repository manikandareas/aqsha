// Shared binding from a session store → JourneyViewModel + JourneyActions.
// Production (API flow) and design-lab (local session) both drive OnboardingJourney through this.

import {
	BACK_TARGET,
	canPrimary,
	primaryIntent,
	type OnboardingAnswers,
	type OnboardingStep
} from './onboarding-machine';
import type { JourneyActions, JourneyViewModel } from './journey-view';

/** Minimal session surface both drivers expose (getters so Svelte runes stay reactive). */
export type JourneySession = {
	readonly step: OnboardingStep;
	setStep(next: OnboardingStep): void;
	readonly answers: OnboardingAnswers;
	setBackground(id: string): void;
	toggleInterest(id: string): void;
	setSource(id: string): void;
	setSourceOther(value: string): void;
	readonly isSubmitting: boolean;
	readonly errorMessage: string | null;
};

export function journeyModelOf(session: JourneySession): JourneyViewModel {
	return {
		step: session.step,
		answers: session.answers,
		isSubmitting: session.isSubmitting,
		errorMessage: session.errorMessage,
		canPrimary: canPrimary(session.step, session.answers, session.isSubmitting)
	};
}

export function journeyActionsOf(
	session: JourneySession,
	onSubmit: () => void | Promise<void>
): JourneyActions {
	return {
		back() {
			const target = BACK_TARGET[session.step];
			if (target) session.setStep(target);
		},
		primary() {
			void runPrimary(session, onSubmit);
		},
		setBackground: (id) => session.setBackground(id),
		toggleInterest: (id) => session.toggleInterest(id),
		setSource: (id) => session.setSource(id),
		setSourceOther: (value) => session.setSourceOther(value)
	};
}

async function runPrimary(
	session: JourneySession,
	onSubmit: () => void | Promise<void>
): Promise<void> {
	const intent = primaryIntent(session.step);
	if (intent.type === 'advance') {
		session.setStep(intent.step);
		return;
	}
	await onSubmit();
}
