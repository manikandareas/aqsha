<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';

	/**
	 * Deliberately not a progress bar. A quiet monospace counter ("01 / 03") with the active
	 * number lit and the current section named. Port from
	 * apps/web/features/onboarding/components/onboarding-step-indicator.tsx — framer AnimatePresence
	 * on the number → Svelte `{#key}` + `fly` (collapses to no motion when reduced).
	 */
	let { index, total, label }: { index: number; total: number; label: string } = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	const reduce = $derived(prefersReducedMotion.current);
</script>

<div class="mb-8 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-muted-foreground">
	<span class="relative inline-block h-[1.2em] w-[1.4em] text-center text-foreground">
		{#key pad(index)}
			<span
				class="absolute inset-0 inline-block"
				in:fly={reduce ? { duration: 0 } : { y: 6, duration: 200 }}
				out:fly={reduce ? { duration: 0 } : { y: -6, duration: 200 }}
			>
				{pad(index)}
			</span>
		{/key}
	</span>
	<span aria-hidden="true" class="text-muted-foreground/40">/</span>
	<span>{pad(total)}</span>
	<span aria-hidden="true" class="h-3 w-px bg-border"></span>
	<span class="tracking-normal">{label}</span>
</div>
