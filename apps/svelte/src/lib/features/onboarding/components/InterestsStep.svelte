<script lang="ts">
	import { INTEREST_OPTIONS, MIN_INTERESTS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import InterestChip from './InterestChip.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, ontoggle }: { value: string[]; ontoggle: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.interests;
	const remaining = $derived(Math.max(0, MIN_INTERESTS - value.length));
</script>

<!-- The live constellation hangs in the page margin (JourneyOrnaments); each chip here is one of
     its stars. -->
<div class="text-center">
	<StepHeading title={copy.title} subtitle={copy.description} />

	<div class="stagger mx-auto flex max-w-2xl flex-wrap justify-center gap-2" style="--stagger-step: 30ms">
		{#each INTEREST_OPTIONS as option, i (option.id)}
			<div style="--i: {i}">
				<InterestChip selected={value.includes(option.id)} onclick={() => ontoggle(option.id)}>
					{option.label}
				</InterestChip>
			</div>
		{/each}
	</div>

	<p class="mt-6 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1" aria-live="polite">
		<span class="font-mono text-xs text-foreground">{value.length} dipilih</span>
		<span class="text-xs text-muted-foreground">
			{#if remaining > 0}
				· {remaining} lagi untuk membentuk pola
			{:else}
				· konstelasimu terbentuk
			{/if}
		</span>
	</p>
</div>
