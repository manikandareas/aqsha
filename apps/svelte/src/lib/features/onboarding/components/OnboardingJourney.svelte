<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ArrowLeftIcon, ArrowRight, Loader2Icon, MoonIcon, SunIcon } from '$lib/icons';
	import { themeContext } from '$lib/theme';
	import { backStep, ONBOARDING_STEPS, PRIMARY_LABEL } from '../lib/onboarding-machine';
	import { STEP_ACCENT } from '../lib/onboarding-content';
	import { pageEnter, pageExit } from '../lib/journey-transitions';
	import type { JourneyActions, JourneyViewModel } from '../lib/journey-driver';
	import JourneyOrnaments from './JourneyOrnaments.svelte';
	import OnboardingStepIndicator from './OnboardingStepIndicator.svelte';
	import WelcomeStep from './WelcomeStep.svelte';
	import BackgroundStep from './BackgroundStep.svelte';
	import InterestsStep from './InterestsStep.svelte';
	import SourceStep from './SourceStep.svelte';
	import FinishStep from './FinishStep.svelte';

	/**
	 * Presentation shell of the journey: one centered question column with hand-drawn margin
	 * doodles around it (JourneyOrnaments), the step badge above every chapter, chapter swap
	 * motion, and the anchored action row. Pure view — status query, mutation, and navigation live
	 * in OnboardingPage; the design lab drives this same component with local state.
	 *
	 * Each chapter sets its own accent via STEP_ACCENT; this shell inks the margin doodles with it.
	 * Outgoing and incoming steps share one grid cell (`[grid-area:1/1]`) so the swap crossfades
	 * in place instead of shoving the action row. Finish density is CSS under `[data-step='finish']`.
	 */
	let {
		model,
		actions
	}: {
		model: JourneyViewModel;
		actions: JourneyActions;
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);
	const stepNumber = $derived(ONBOARDING_STEPS.indexOf(model.step) + 1);
	const backTarget = $derived(backStep(model.step));
	const accent = $derived(STEP_ACCENT[model.step]);

	// Resolved mode is undefined during SSR; default to light so the pre-hydration icon is stable.
	const theme = themeContext.get();
	const isDark = $derived(theme.mode === 'dark');

	// Direction feeds the page-lift transition so going back reads as returning.
	let direction = $state<1 | -1>(1);

	function handleBack() {
		direction = -1;
		actions.back();
	}

	function handlePrimary() {
		direction = 1;
		actions.primary();
	}

	function onsubmit(event: SubmitEvent) {
		event.preventDefault();
		if (model.canPrimary) handlePrimary();
	}

	// Hand focus to the incoming step's heading after the swap so keyboard/SR users land on the new
	// question, not on stale content. rAF waits for the keyed wrapper to be in the DOM.
	function focusStepHeading(node: HTMLElement) {
		const frame = requestAnimationFrame(() => {
			node.querySelector<HTMLElement>('[data-onboarding-heading]')?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}
</script>

<div
	class="journey relative mx-auto flex w-full max-w-6xl px-6 sm:px-10"
	data-step={model.step}
	style="--journey-accent: {accent.accent}; --journey-accent-ink: {accent.ink}"
>
	<JourneyOrnaments step={model.step} interests={model.answers.interests} />

	<div class="relative flex min-w-0 flex-1 flex-col">
		<div class="journey-chrome flex items-start justify-between">
			<span class="journey-brand font-semibold tracking-normal text-foreground">Aqsha</span>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-9 text-muted-foreground hover:text-foreground"
				aria-label={isDark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
				onclick={() => theme.toggle()}
			>
				<!-- HugeiconsIcon renders its glyph once at init; the #if remounts it on theme flips. -->
				{#if isDark}
					<Icon icon={SunIcon} class="size-4.5" />
				{:else}
					<Icon icon={MoonIcon} class="size-4.5" />
				{/if}
			</Button>
		</div>

		<form
			{onsubmit}
			aria-busy={model.isSubmitting}
			class="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col"
		>
			<div class="journey-body flex min-h-0 flex-1 flex-col">
				<!-- The badge stays mounted across chapters, so its digit ticks while content swaps. -->
				<div class="journey-badge flex justify-center">
					<OnboardingStepIndicator index={stepNumber} total={ONBOARDING_STEPS.length} />
				</div>

				<div class="grid min-h-0 flex-1">
					{#key model.step}
						<div
							class="flex min-h-0 min-w-0 flex-1 flex-col [grid-area:1/1]"
							in:pageEnter={{ direction, reduce }}
							out:pageExit={{ direction, reduce }}
							{@attach focusStepHeading}
						>
							{#if model.step === 'welcome'}
								<WelcomeStep />
							{:else if model.step === 'background'}
								<BackgroundStep value={model.answers.background} onselect={actions.setBackground} />
							{:else if model.step === 'interests'}
								<InterestsStep value={model.answers.interests} ontoggle={actions.toggleInterest} />
							{:else if model.step === 'source'}
								<SourceStep
									value={model.answers.source}
									other={model.answers.sourceOther}
									onselect={actions.setSource}
									onotherchange={actions.setSourceOther}
								/>
							{:else if model.step === 'finish'}
								<FinishStep answers={model.answers} />
							{/if}
						</div>
					{/key}
				</div>
			</div>

			{#if model.errorMessage}
				<p class="mb-4 text-center text-sm text-destructive" role="alert" aria-live="assertive">
					{model.errorMessage}
				</p>
			{/if}

			<!-- Inline action row: icon back + primary sharing one line, centered on the measure. -->
			<div class="mx-auto flex w-full max-w-md items-center gap-2.5 pb-1">
				{#if backTarget}
					<Button
						type="button"
						variant="outline"
						size="icon"
						class="size-12 shrink-0"
						aria-label="Kembali"
						onclick={handleBack}
					>
						<Icon icon={ArrowLeftIcon} class="size-4.5" />
					</Button>
				{/if}
				<Button type="submit" disabled={!model.canPrimary} class="h-12 flex-1 text-[0.95rem]">
					{#if model.isSubmitting}
						<Icon icon={Loader2Icon} class="size-4 animate-spin" />
					{/if}
					{PRIMARY_LABEL[model.step]}
					{#if !model.isSubmitting && model.step !== 'finish'}
						<Icon icon={ArrowRight} class="size-4" />
					{/if}
				</Button>
			</div>
		</form>
	</div>
</div>

<style>
	.journey {
		min-height: 100svh;
		padding-block: 1.5rem;
	}

	.journey-chrome {
		min-height: 2.5rem;
	}

	.journey-brand {
		font-size: 1.25rem;
	}

	.journey-body {
		padding-top: 1rem;
		padding-bottom: 2rem;
	}

	.journey-badge {
		margin-bottom: 1.25rem;
	}

	/* Finish locks to one viewport so the send-off never scrolls on desktop laptops. */
	.journey[data-step='finish'] {
		height: 100svh;
		overflow: hidden;
		padding-block: 1rem;
	}

	.journey[data-step='finish'] .journey-chrome {
		min-height: 2rem;
	}

	.journey[data-step='finish'] .journey-brand {
		font-size: 1.125rem;
	}

	.journey[data-step='finish'] .journey-body {
		padding-top: 0.5rem;
		padding-bottom: 1.25rem;
	}

	.journey[data-step='finish'] .journey-badge {
		margin-bottom: 0.75rem;
	}

	@media (min-width: 640px) {
		.journey {
			padding-block: 2rem;
		}

		.journey-body {
			padding-top: 1.75rem;
		}

		.journey[data-step='finish'] {
			padding-block: 1.25rem;
		}

		.journey[data-step='finish'] .journey-body {
			padding-top: 0.75rem;
		}

		.journey[data-step='finish'] .journey-badge {
			margin-bottom: 1rem;
		}
	}
</style>
