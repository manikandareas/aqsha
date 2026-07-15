<script lang="ts">
	import { fly } from 'svelte/transition';
	import { motionContext } from '$lib/motion';

	// Crossfade-slide the whole label on billing-period change (`{#key}` + `fly`) — avoids per-character width jitter. Reduced-motion → instant swap.
	let { label }: { label: string } = $props();

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);
</script>

<span class="relative inline-block">
	{#key label}
		<span class="inline-block" in:fly={{ y: reduce ? 0 : 12, duration: reduce ? 120 : 300 }}>
			{label}
		</span>
	{/key}
</span>
