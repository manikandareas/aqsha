import type { JourneySession } from './lib/journey-driver';
import { asJourneySession, createOnboardingSession } from './onboarding-session.svelte';

/**
 * Local-only journey session for the design lab: same JourneySession surface as the production
 * flow, without status query or complete mutation. Submit is simulated by the lab driver.
 */
export function createLocalOnboardingSession(): JourneySession & {
	beginSubmit(): void;
	reset(): void;
} {
	const session = createOnboardingSession();
	let isSubmitting = $state(false);
	const journey = asJourneySession(session, {
		get isSubmitting() {
			return isSubmitting;
		},
		get errorMessage() {
			return null;
		}
	});

	return Object.defineProperties(journey, {
		beginSubmit: {
			value() {
				isSubmitting = true;
			},
			enumerable: true
		},
		reset: {
			value() {
				isSubmitting = false;
				session.reset();
			},
			enumerable: true
		}
	}) as JourneySession & { beginSubmit(): void; reset(): void };
}
