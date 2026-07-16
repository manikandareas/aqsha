<script lang="ts">
	import OnboardingJourney from '$lib/features/onboarding/components/OnboardingJourney.svelte';
	import OnboardingLayout from '$lib/features/onboarding/components/OnboardingLayout.svelte';
	import { journeyActionsOf, journeyModelOf } from '$lib/features/onboarding/lib/journey-driver';
	import { createLocalOnboardingSession } from '$lib/features/onboarding/local-session.svelte';

	// Design-lab driver: production OnboardingJourney over a local session — no status query, no
	// mutation. Submit (finish, "Mulai research") is simulated; the demo then loops back to welcome.
	const session = createLocalOnboardingSession();
	const model = $derived(journeyModelOf(session));
	const actions = journeyActionsOf(session, async () => {
		session.beginSubmit();
		await new Promise((resolve) => setTimeout(resolve, 600));
		session.reset();
	});
</script>

<svelte:head>
	<title>Design lab — onboarding journey</title>
</svelte:head>

<OnboardingLayout>
	<OnboardingJourney {model} {actions} />
</OnboardingLayout>
