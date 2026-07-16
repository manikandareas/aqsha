<script lang="ts">
	import { INTEREST_OPTIONS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import InterestChip from './InterestChip.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, ontoggle }: { value: string[]; ontoggle: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.interests;
</script>

<div>
	<StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.description} />
	<div class="flex flex-wrap gap-2">
		{#each INTEREST_OPTIONS as option (option.id)}
			<InterestChip selected={value.includes(option.id)} onclick={() => ontoggle(option.id)}>
				{option.label}
			</InterestChip>
		{/each}
	</div>
	<p class="mt-4 font-mono text-xs text-muted-foreground" aria-live="polite">
		{value.length} dipilih
	</p>
</div>
