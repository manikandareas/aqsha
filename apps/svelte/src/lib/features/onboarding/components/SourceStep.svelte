<script module lang="ts">
	import { SOURCE_OPTIONS, SOURCE_OTHER, type OnboardingOption } from '../lib/onboarding-options';

	// Randomized once per module load to reduce position/anchoring bias, with "Lainnya" pinned
	// last (picking it is an explicit override). SourceStep is never server-rendered (the page
	// shows a loader until status resolves), so this module-scope randomness cannot cause a
	// hydration mismatch — and the array is an immutable const (no cross-user mutable state).
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
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	const reduce = $derived(prefersReducedMotion.current);
	const copy = ONBOARDING_COPY.source;

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
	<StepHeading title={copy.title} subtitle={copy.description} />
	<div class="mx-auto w-full max-w-md">
		<!-- Two columns keep all nine options above the fold; "Lainnya" spans the row so the
		     explicit override reads as its own tier. -->
		<div class="stagger grid gap-2 sm:grid-cols-2">
			{#each SHUFFLED_SOURCES as option, i (option.id)}
				<div style="--i: {i}" class={option.id === SOURCE_OTHER.id ? 'sm:col-span-2' : ''}>
					<SelectableOption selected={value === option.id} onclick={() => onselect(option.id)}>
						{option.label}
					</SelectableOption>
				</div>
			{/each}
		</div>
		{#if value === SOURCE_OTHER.id}
			<!-- Slide (not an instant mount) so selecting "Lainnya" eases the field in instead of snapping
			     the button row down. Padding lives on the wrapper so slide animates the gap too. -->
			<div class="pt-3" transition:slide={reduce ? { duration: 0 } : { duration: 200 }}>
				<Input
					value={other}
					oninput={(event) => onotherchange((event.currentTarget as HTMLInputElement).value)}
					placeholder="Ceritakan dari mana, ya"
					class="h-11 rounded-xl px-3.5 text-sm"
					{@attach (node) => node.focus()}
				/>
			</div>
		{/if}
	</div>
</div>
