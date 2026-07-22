import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import { readableApiErrorMessage } from '$lib/errors';
import { buildCompletePayload } from './lib/onboarding-machine';
import type { JourneySession } from './lib/journey-driver';
import { asJourneySession, createOnboardingSession } from './onboarding-session.svelte';

const INCOMPLETE_ANSWERS_MESSAGE = 'Jawaban onboarding belum lengkap.';

/**
 * Onboarding flow state. Function-local `$state` (created per component init, NOT module scope) holds
 * the step + answers; the pure machine (`onboarding-machine.ts`) owns validation/transition logic. The
 * `complete` mutation posts to the API and, on success, sets the onboarding-status cache to
 * `{ completed: true }` synchronously so status consumers stay consistent while the completion
 * just-finished user off `/finish`.
 *
 * Must be called during component init (uses the query + api-client context).
 */
export function createOnboardingFlow(): JourneySession & {
	submit(): Promise<boolean>;
} {
	const session = createOnboardingSession();
	const api = getApiClient();
	const queryClient = useQueryClient();
	let validationError = $state<string | null>(null);

	const complete = createMutation(() => ({
		mutationFn: async () => {
			const payload = buildCompletePayload(session.answers);
			if (!payload) throw new Error(INCOMPLETE_ANSWERS_MESSAGE);
			return unwrap(await api.onboarding.complete.post(payload));
		},
		onSuccess: () => {
			queryClient.setQueryData(queryKeys.onboarding.status(), { completed: true });
		}
	}));

	const journey = asJourneySession(session, {
		get isSubmitting() {
			return complete.isPending;
		},
		get errorMessage() {
			if (validationError) return validationError;
			return complete.error
				? readableApiErrorMessage(complete.error, 'Belum bisa menyimpan. Coba lagi, ya.')
				: null;
		}
	});

	return Object.defineProperties(journey, {
		submit: {
			async value(): Promise<boolean> {
				if (!buildCompletePayload(session.answers)) {
					validationError = INCOMPLETE_ANSWERS_MESSAGE;
					return false;
				}
				validationError = null;
				try {
					await complete.mutateAsync();
					return true;
				} catch {
					return false;
				}
			},
			enumerable: true
		}
	}) as JourneySession & { submit(): Promise<boolean> };
}
