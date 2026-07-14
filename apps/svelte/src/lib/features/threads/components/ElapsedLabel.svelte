<script lang="ts">
	import Shimmer from '$lib/components/ai-elements/Shimmer.svelte';

	/**
	 * "Working" label with a ticking elapsed time (appears after 10s). Deep research awaiting a
	 * task-mode subagent can sit idle for minutes with no event; a running timer reassures "still
	 * working", not frozen. `startedAt` (durable epoch-ms: `steps[id].startedAt` snapshot / user
	 * message `createdAt`) makes the timer survive refresh; without it, mount time. Clamped ≥0 for
	 * client/server clock skew. Port of `elapsed-label.tsx`.
	 */
	let { base, startedAt }: { base: string; startedAt?: number } = $props();

	const mountedAt = Date.now();
	let now = $state(mountedAt);
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	const start = $derived(startedAt && startedAt > 0 ? startedAt : mountedAt);
	const secs = $derived(Math.max(0, Math.floor((now - start) / 1000)));
	const label = $derived.by(() => {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return secs < 10 ? `${base}…` : `${base}… ${m > 0 ? `${m}m ` : ''}${s}s`;
	});
</script>

<Shimmer as="span" class="font-medium" text={label} />
