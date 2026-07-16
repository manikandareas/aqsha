<script lang="ts">
	import { toggleMode } from 'mode-watcher';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import OnboardingJourney from '$lib/features/onboarding/components/OnboardingJourney.svelte';
	import OnboardingLayout from '$lib/features/onboarding/components/OnboardingLayout.svelte';
	import {
		BACK_TARGET,
		canPrimary as canPrimaryOf,
		EMPTY_ANSWERS,
		primaryIntent,
		toggleInterest,
		type OnboardingAnswers,
		type OnboardingStep
	} from '$lib/features/onboarding/lib/onboarding-machine';
	import type { JourneyActions, JourneyViewModel } from '$lib/features/onboarding/lib/journey-view';

	// Design-lab driver: the production OnboardingJourney presentation over local state — no
	// status query, no mutation. Submit is simulated so the finish chapter is reachable.
	let step = $state<OnboardingStep>('welcome');
	let answers = $state<OnboardingAnswers>({ ...EMPTY_ANSWERS });
	let isSubmitting = $state(false);

	const model = $derived.by(
		(): JourneyViewModel => ({
			step,
			answers,
			isSubmitting,
			errorMessage: null,
			canPrimary: canPrimaryOf(step, answers, isSubmitting)
		})
	);

	function handlePrimary() {
		const intent = primaryIntent(step);
		switch (intent.type) {
			case 'advance':
				step = intent.step;
				return;
			case 'submit':
				isSubmitting = true;
				setTimeout(() => {
					isSubmitting = false;
					step = 'finish';
				}, 600);
				return;
			case 'complete':
				step = 'welcome';
				answers = { ...EMPTY_ANSWERS };
				return;
		}
	}

	const actions: JourneyActions = {
		back() {
			const target = BACK_TARGET[step];
			if (target) step = target;
		},
		primary: handlePrimary,
		setBackground(id) {
			answers = { ...answers, background: id };
		},
		toggleInterest(id) {
			answers = { ...answers, interests: toggleInterest(answers.interests, id) };
		},
		setSource(id) {
			answers = { ...answers, source: id };
		},
		setSourceOther(value) {
			answers = { ...answers, sourceOther: value };
		}
	};
</script>

<svelte:head>
	<title>Design lab — onboarding journey</title>
</svelte:head>

<div class="fixed top-4 right-4 z-50 flex gap-2">
	<Button variant="outline" size="sm" onclick={toggleMode}>Ganti tema</Button>
</div>

<OnboardingLayout>
	<OnboardingJourney {model} {actions} />
</OnboardingLayout>
