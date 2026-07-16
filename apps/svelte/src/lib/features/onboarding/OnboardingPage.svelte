<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { createQuery } from '@tanstack/svelte-query';
	import { getApiClient } from '$lib/api';
	import { queryKeys, unwrap } from '$lib/query';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner';
	import { Icon, ArrowLeftIcon, ArrowRight, Loader2Icon } from '$lib/icons';
	import {
		BACK_TARGET,
		HOME_AFTER_ONBOARDING,
		PRIMARY_LABEL,
		STEP_LABEL
	} from './lib/onboarding-machine';
	import { createOnboardingFlow } from './state.svelte';
	import OnboardingLayout from './components/OnboardingLayout.svelte';
	import OnboardingStepIndicator from './components/OnboardingStepIndicator.svelte';
	import WelcomeStep from './components/WelcomeStep.svelte';
	import BackgroundStep from './components/BackgroundStep.svelte';
	import InterestsStep from './components/InterestsStep.svelte';
	import SourceStep from './components/SourceStep.svelte';
	import FinishStep from './components/FinishStep.svelte';

	/**
	 * Onboarding wizard. The pure step machine + validation lives in `lib/onboarding-machine.ts`; the
	 * flow state + complete mutation in `state.svelte.ts`. Outgoing and incoming steps share one grid
	 * cell (`[grid-area:1/1]`) so `{#key}` + `fly` crossfades them in place instead of tiling them in
	 * flow and shoving the buttons; collapses to no motion when reduced.
	 */
	const api = getApiClient();
	const flow = createOnboardingFlow();
	const reduce = $derived(prefersReducedMotion.current);

	const statusQuery = createQuery(() => ({
		queryKey: queryKeys.onboarding.status(),
		queryFn: async () => unwrap(await api.onboarding.status.get())
	}));
	const status = $derived(statusQuery.data);

	// Only at mount: redirect users who already completed onboarding. Ignored after leaving "welcome"
	// so a late "completed" status can't skip the finish screen.
	$effect(() => {
		if (flow.step === 'welcome' && status?.completed) {
			void goto(resolve('/app/explore'), { replaceState: true });
		}
	});

	const isQuestionStep = $derived(flow.questionIndex >= 0);
	const canPrimary = $derived(
		!flow.isSubmitting && (!isQuestionStep || flow.isStepValid(flow.step))
	);
	const backTarget = $derived(BACK_TARGET[flow.step]);

	function handleBack() {
		const target = BACK_TARGET[flow.step];
		if (target) flow.setStep(target);
	}

	async function handlePrimary() {
		switch (flow.step) {
			case 'welcome':
				flow.setStep('background');
				return;
			case 'background':
				flow.setStep('interests');
				return;
			case 'interests':
				flow.setStep('source');
				return;
			case 'source': {
				const ok = await flow.submit();
				if (ok) flow.setStep('finish');
				return;
			}
			case 'finish':
				void goto(resolve(HOME_AFTER_ONBOARDING), { replaceState: true });
				return;
		}
	}

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (canPrimary) void handlePrimary();
	}
</script>

{#if flow.step === 'welcome' && (!status || status.completed)}
	<!-- Wait for status before showing welcome — avoids flashing the wizard to a user we're redirecting. -->
	<OnboardingLayout>
		<div class="flex justify-center text-muted-foreground">
			<FlickerSpinner class="size-5" />
		</div>
	</OnboardingLayout>
{:else}
	<OnboardingLayout>
		{#if isQuestionStep}
			<OnboardingStepIndicator
				index={flow.questionIndex + 1}
				total={flow.totalQuestions}
				label={STEP_LABEL[flow.step] ?? ''}
			/>
		{:else}
			<div class="mb-8 h-5"></div>
		{/if}

		<form {onsubmit}>
			<div class="grid">
				{#key flow.step}
					<div
						class="[grid-area:1/1]"
						in:fly={reduce ? { duration: 0 } : { y: 8, duration: 220 }}
						out:fly={reduce ? { opacity: 1, duration: 0 } : { y: -8, duration: 220 }}
					>
						{#if flow.step === 'welcome'}
							<WelcomeStep />
						{:else if flow.step === 'background'}
							<BackgroundStep value={flow.answers.background} onselect={flow.setBackground} />
						{:else if flow.step === 'interests'}
							<InterestsStep value={flow.answers.interests} ontoggle={flow.toggleInterest} />
						{:else if flow.step === 'source'}
							<SourceStep
								value={flow.answers.source}
								other={flow.answers.sourceOther}
								onselect={flow.setSource}
								onotherchange={flow.setSourceOther}
							/>
						{:else if flow.step === 'finish'}
							<FinishStep answers={flow.answers} />
						{/if}
					</div>
				{/key}
			</div>

			{#if flow.errorMessage}
				<p class="mt-4 text-sm text-destructive">{flow.errorMessage}</p>
			{/if}

			<div class="mt-8 flex items-center justify-between gap-3">
				{#if backTarget}
					<Button type="button" variant="ghost" onclick={handleBack}>
						<Icon icon={ArrowLeftIcon} class="size-4" />
						Kembali
					</Button>
				{:else}
					<span></span>
				{/if}
				<Button type="submit" disabled={!canPrimary} class="h-11 px-6">
					{#if flow.isSubmitting}
						<Icon icon={Loader2Icon} class="size-4 animate-spin" />
					{/if}
					{PRIMARY_LABEL[flow.step]}
					{#if !flow.isSubmitting && flow.step !== 'finish'}
						<Icon icon={ArrowRight} class="size-4" />
					{/if}
				</Button>
			</div>
		</form>
	</OnboardingLayout>
{/if}
