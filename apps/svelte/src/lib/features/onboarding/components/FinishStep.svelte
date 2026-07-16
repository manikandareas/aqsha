<script lang="ts">
	import { Icon, SparklesIcon } from '$lib/icons';
	import { buildFinishReflection, ONBOARDING_COPY } from '../lib/onboarding-content';
	import type { OnboardingAnswers } from '../lib/onboarding-machine';

	let { answers }: { answers: OnboardingAnswers } = $props();

	const copy = ONBOARDING_COPY.finish;
	const reflection = $derived(buildFinishReflection(answers));
</script>

<section>
	<p class="mb-4 font-mono text-xs tracking-wider text-muted-foreground">{copy.eyebrow}</p>
	<span
		aria-hidden="true"
		class="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
	>
		<Icon icon={SparklesIcon} class="size-5" />
	</span>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading text-3xl leading-none font-normal tracking-tight text-foreground outline-none sm:text-4xl"
	>
		{copy.title}
	</h1>
	<p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
		{#if reflection.backgroundLabel}
			Titik berangkatmu: <strong class="font-medium text-foreground">
				{reflection.backgroundLabel}</strong
			>.
		{/if}
		Rasa penasaranmu:
		<strong class="font-medium text-foreground"> {reflection.interestSummary}</strong>.
	</p>
	<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
		{copy.description}
	</p>
</section>
