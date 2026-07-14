<script module lang="ts">
	import { SOURCE_OPTIONS, SOURCE_OTHER, type OnboardingOption } from '../lib/onboarding-options';

	// Randomized once per module load to reduce position/anchoring bias, with "Lainnya" pinned
	// last (picking it is an explicit override). SourceStep is never server-rendered (the page
	// shows a loader until status resolves), so this module-scope randomness cannot cause a
	// hydration mismatch — and the array is an immutable const (no cross-user mutable state, §3.5).
	// Port of SHUFFLED_SOURCES in apps/web/features/onboarding/components/onboarding-steps.tsx.
	const SHUFFLED_SOURCES: OnboardingOption[] = (() => {
		const shuffled = [...SOURCE_OPTIONS];
		for (let i = shuffled.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return [...shuffled, SOURCE_OTHER];
	})();
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	// Port 1:1 from apps/web/features/onboarding/components/onboarding-steps.tsx (SourceStep).
	let {
		value,
		other,
		onselect,
		onotherchange
	}: {
		value: string | null;
		other: string;
		onselect: (id: string) => void;
		onotherchange: (value: string) => void;
	} = $props();
</script>

<div>
	<StepHeading
		title="Dari mana kamu tahu Aqsha?"
		subtitle="Membantu kami tahu cara orang menemukan Aqsha."
	/>
	<div class="grid gap-2.5">
		{#each SHUFFLED_SOURCES as option (option.id)}
			<SelectableOption selected={value === option.id} onclick={() => onselect(option.id)}>
				{option.label}
			</SelectableOption>
		{/each}
	</div>
	{#if value === SOURCE_OTHER.id}
		<Input
			value={other}
			oninput={(event) => onotherchange((event.currentTarget as HTMLInputElement).value)}
			placeholder="Ceritakan dari mana, ya"
			class="mt-3 h-11 rounded-xl px-3.5 text-sm"
			{@attach (node) => node.focus()}
		/>
	{/if}
</div>
