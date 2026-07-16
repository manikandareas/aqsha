<script lang="ts">
	import { BACKGROUND_OPTIONS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, onselect }: { value: string | null; onselect: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.background;
</script>

<div>
	<StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.description} />
	<div class="grid gap-2.5">
		{#each BACKGROUND_OPTIONS as option (option.id)}
			<SelectableOption selected={value === option.id} onclick={() => onselect(option.id)}>
				{option.label}
			</SelectableOption>
		{/each}
	</div>
</div>
