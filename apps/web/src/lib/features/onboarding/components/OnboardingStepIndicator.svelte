<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	/**
	 * Compact solid step badge ("Langkah 1 dari 5") above every chapter heading. Ink face per the
	 * exclusive-choice grammar — the badge names where you are in the sequence. The number ticks
	 * via `{#key}` + `fly` (no motion when reduced); role/aria-label keep progress legible without
	 * color or motion.
	 */
	let { index, total }: { index: number; total: number } = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div
	role="status"
	aria-label={`Langkah ${index} dari ${total}`}
	class="inline-flex h-7 items-center gap-[0.35em] rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
>
	<span>Langkah</span>
	<span class="relative inline-block h-[1.25em] w-[1ch] overflow-hidden text-center">
		{#key index}
			<span
				class="absolute inset-0 inline-block tabular-nums"
				in:fly={reduce ? { duration: 0 } : { y: 8, duration: 200 }}
				out:fly={reduce ? { duration: 0 } : { y: -8, duration: 200 }}
			>
				{index}
			</span>
		{/key}
	</span>
	<span>dari {total}</span>
</div>
