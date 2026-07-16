<script lang="ts">
	import { BACKGROUND_OPTIONS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, onselect }: { value: string | null; onselect: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.background;
</script>

<div>
	<StepHeading title={copy.title} subtitle={copy.description} />
	<div class="stagger mx-auto grid w-full max-w-md gap-2.5">
		{#each BACKGROUND_OPTIONS as option, i (option.id)}
			<div style="--i: {i}">
				<SelectableOption
					index={i + 1}
					selected={value === option.id}
					onclick={() => onselect(option.id)}
				>
					{option.label}
				</SelectableOption>
			</div>
		{/each}
	</div>
</div>
