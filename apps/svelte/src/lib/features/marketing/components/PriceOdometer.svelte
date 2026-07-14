<script lang="ts">
	import { fly } from 'svelte/transition';
	import { motionContext } from '$lib/motion';

	// PriceOdometer — total harga berganti dengan slide saat periode billing berubah. Web memakai
	// AnimatePresence per-karakter; di sini crossfade-slide seluruh label via `{#key}` + `fly` (feel
	// setara §3.2, tanpa jitter width). Reduced-motion → ganti instan. Port `price-odometer`.
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
