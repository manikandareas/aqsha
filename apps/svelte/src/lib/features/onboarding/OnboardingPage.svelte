<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import { getApiClient } from '$lib/api';
	import { getAuthState } from '$lib/auth';
	import { queryKeys, unwrap } from '$lib/query';
	import { readableApiErrorMessage } from '$lib/errors';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner';
	import {
		BACK_TARGET,
		canPrimary as canPrimaryOf,
		HOME_AFTER_ONBOARDING,
		primaryIntent
	} from './lib/onboarding-machine';
	import type { JourneyActions, JourneyViewModel } from './lib/journey-view';
	import { createOnboardingFlow } from './state.svelte';
	import OnboardingLayout from './components/OnboardingLayout.svelte';
	import OnboardingJourney from './components/OnboardingJourney.svelte';
	import OnboardingStatusError from './components/OnboardingStatusError.svelte';
	import JourneyCentered from './components/JourneyCentered.svelte';

	/**
	 * Onboarding orchestrator: status query + gating, back/primary handling, submit mutation, and
	 * navigation to `/app`. Presentation (journey rail, chapter motion, action row) lives in
	 * `components/OnboardingJourney.svelte`; the pure step machine + validation in
	 * `lib/onboarding-machine.ts`; flow state + complete mutation in `state.svelte.ts`.
	 */
	const api = getApiClient();
	const flow = createOnboardingFlow();

	// Gate on Clerk being signed-in: a hard reload fires this before clerk-js loads, and a
	// tokenless request 401s into the error state instead of resolving to welcome.
	const auth = getAuthState();
	const statusQuery = createQuery(() => ({
		queryKey: queryKeys.onboarding.status(),
		queryFn: async () => unwrap(await api.onboarding.status.get()),
		enabled: auth.isSignedIn
	}));
	const status = $derived(statusQuery.data);

	// Only at mount: redirect users who already completed onboarding. Ignored after leaving "welcome"
	// so a late "completed" status can't skip the finish screen.
	$effect(() => {
		if (flow.step === 'welcome' && status?.completed) {
			void goto(resolve(HOME_AFTER_ONBOARDING), { replaceState: true });
		}
	});

	const statusErrorMessage = $derived(
		statusQuery.error
			? readableApiErrorMessage(
					statusQuery.error,
					'Belum bisa memeriksa status onboarding. Coba lagi, ya.'
				)
			: null
	);

	const model = $derived.by(
		(): JourneyViewModel => ({
			step: flow.step,
			answers: flow.answers,
			isSubmitting: flow.isSubmitting,
			errorMessage: flow.errorMessage,
			canPrimary: canPrimaryOf(flow.step, flow.answers, flow.isSubmitting)
		})
	);

	async function handlePrimary() {
		const intent = primaryIntent(flow.step);
		switch (intent.type) {
			case 'advance':
				flow.setStep(intent.step);
				return;
			case 'submit': {
				const ok = await flow.submit();
				if (ok) flow.setStep('finish');
				return;
			}
			case 'complete':
				void goto(resolve(HOME_AFTER_ONBOARDING), { replaceState: true });
				return;
		}
	}

	const actions: JourneyActions = {
		back() {
			const target = BACK_TARGET[flow.step];
			if (target) flow.setStep(target);
		},
		primary() {
			void handlePrimary();
		},
		setBackground: flow.setBackground,
		toggleInterest: flow.toggleInterest,
		setSource: flow.setSource,
		setSourceOther: flow.setSourceOther
	};
</script>

{#if flow.step === 'welcome' && statusQuery.isError}
	<OnboardingLayout>
		<JourneyCentered>
			<OnboardingStatusError
				message={statusErrorMessage ?? 'Belum bisa memeriksa status onboarding.'}
				onretry={() => void statusQuery.refetch()}
			/>
		</JourneyCentered>
	</OnboardingLayout>
{:else if flow.step === 'welcome' && (statusQuery.isPending || status?.completed)}
	<!-- Wait for status before showing welcome — avoids flashing the wizard to a user we're redirecting. -->
	<OnboardingLayout>
		<JourneyCentered>
			<div class="text-muted-foreground" role="status" aria-label="Memuat onboarding">
				<FlickerSpinner class="size-5" />
			</div>
		</JourneyCentered>
	</OnboardingLayout>
{:else}
	<OnboardingLayout>
		<OnboardingJourney {model} {actions} />
	</OnboardingLayout>
{/if}
