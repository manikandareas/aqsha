<script lang="ts">
	import { INTEREST_OPTIONS, MIN_INTERESTS } from '../lib/onboarding-options';
	import InterestChip from './InterestChip.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, ontoggle }: { value: string[]; ontoggle: (id: string) => void } = $props();
</script>

<div>
	<StepHeading
		title="Bidang apa yang kamu minati?"
		subtitle={`Pilih minimal ${MIN_INTERESTS}. Ini langsung membentuk feed Jelajah kamu.`}
	/>
	<div class="flex flex-wrap gap-2">
		{#each INTEREST_OPTIONS as option (option.id)}
			<InterestChip selected={value.includes(option.id)} onclick={() => ontoggle(option.id)}>
				{option.label}
			</InterestChip>
		{/each}
	</div>
	<p class="mt-4 font-mono text-xs text-muted-foreground">{value.length} dipilih</p>
</div>
