import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import { readableApiErrorMessage } from '$lib/errors';
import {
	buildCompletePayload,
	EMPTY_ANSWERS,
	type OnboardingAnswers,
	type OnboardingStep,
	toggleInterest as toggleInterestPure
} from './lib/onboarding-machine';
import type { JourneySession } from './lib/journey-driver';

/**
 * Onboarding flow state. Function-local `$state` (created per component init, NOT module scope) holds
 * the step + answers; the pure machine (`onboarding-machine.ts`) owns validation/transition logic. The
 * `complete` mutation posts to the API and, on success, sets the onboarding-status cache to
 * `{ completed: true }` synchronously (no window refetch) so the OnboardingGate does not bounce the
 * just-finished user off `/finish`.
 *
 * Must be called during component init (uses the query + api-client context).
 */
export function createOnboardingFlow(): JourneySession & {
	submit(): Promise<boolean>;
} {
	const api = getApiClient();
	const queryClient = useQueryClient();

	let step = $state<OnboardingStep>('welcome');
	let answers = $state<OnboardingAnswers>({ ...EMPTY_ANSWERS });

	const complete = createMutation(() => ({
		mutationFn: async () => {
			const payload = buildCompletePayload(answers);
			if (!payload) throw new Error('Jawaban onboarding belum lengkap.');
			return unwrap(await api.onboarding.complete.post(payload));
		},
		onSuccess: () => {
			queryClient.setQueryData(queryKeys.onboarding.status(), { completed: true });
		}
	}));

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
		async submit(): Promise<boolean> {
			if (!buildCompletePayload(answers)) return false;
			try {
				await complete.mutateAsync();
				return true;
			} catch {
				return false;
			}
		},
		get isSubmitting() {
			return complete.isPending;
		},
		get errorMessage(): string | null {
			return complete.error
				? readableApiErrorMessage(complete.error, 'Belum bisa menyimpan. Coba lagi, ya.')
				: null;
		}
	};
}
