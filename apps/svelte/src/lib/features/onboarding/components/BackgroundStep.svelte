<script lang="ts">
	import { BACKGROUND_OPTIONS } from '../lib/onboarding-options';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, onselect }: { value: string | null; onselect: (id: string) => void } = $props();
</script>

<div>
	<StepHeading title="Kamu saat ini..." subtitle="Biar kami tahu cara terbaik menemanimu." />
	<div class="grid gap-2.5">
		{#each BACKGROUND_OPTIONS as option (option.id)}
			<SelectableOption selected={value === option.id} onclick={() => onselect(option.id)}>
				{option.label}
			</SelectableOption>
		{/each}
	</div>
</div>
