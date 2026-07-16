<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import { getApiClient } from '$lib/api';
	import { getAuthState } from '$lib/auth';
	import { queryKeys, unwrap } from '$lib/query';
	import { readableApiErrorMessage } from '$lib/errors';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner';
	import { HOME_AFTER_ONBOARDING } from './lib/onboarding-machine';
	import { journeyActionsOf, journeyModelOf } from './lib/journey-driver';
	import { createOnboardingFlow } from './state.svelte';
	import OnboardingLayout from './components/OnboardingLayout.svelte';
	import OnboardingJourney from './components/OnboardingJourney.svelte';
	import OnboardingStatusError from './components/OnboardingStatusError.svelte';

	/**
	 * Onboarding orchestrator: status query + gating, submit mutation, and navigation to `/app`.
	 * Presentation lives in `OnboardingJourney`; the pure step machine in `onboarding-machine.ts`;
	 * flow state + complete mutation in `state.svelte.ts`; model/actions binding in `journey-driver.ts`.
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

	const model = $derived(journeyModelOf(flow));
	const actions = journeyActionsOf(flow, async () => {
		// "Mulai research" on finish: only navigate once the answers are saved — on failure
		// the error renders above the action row and the user can retry or go back.
		const ok = await flow.submit();
		if (ok) void goto(resolve(HOME_AFTER_ONBOARDING), { replaceState: true });
	});
</script>

{#if flow.step === 'welcome' && statusQuery.isError}
	<OnboardingLayout>
		<div class="flex min-h-svh items-center justify-center px-6">
			<OnboardingStatusError
				message={statusErrorMessage ?? 'Belum bisa memeriksa status onboarding.'}
				onretry={() => void statusQuery.refetch()}
			/>
		</div>
	</OnboardingLayout>
{:else if flow.step === 'welcome' && (statusQuery.isPending || status?.completed)}
	<!-- Wait for status before showing welcome — avoids flashing the wizard to a user we're redirecting. -->
	<OnboardingLayout>
		<div class="flex min-h-svh items-center justify-center px-6">
			<div class="text-muted-foreground" role="status" aria-label="Memuat onboarding">
				<FlickerSpinner class="size-5" />
			</div>
		</div>
	</OnboardingLayout>
{:else}
	<OnboardingLayout>
		<OnboardingJourney {model} {actions} />
	</OnboardingLayout>
{/if}
