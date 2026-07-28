<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { getStickToBottomOptional } from '$lib/components/ai-elements/conversation-state.svelte';
	import type { ThreadHistoryControls } from '$lib/features/threads/lib/thread-history';

	let { history }: { history: ThreadHistoryControls } = $props();

	const stick = getStickToBottomOptional();
	let sentinel = $state<HTMLDivElement | null>(null);
	let requesting = false;

	async function requestOlder(): Promise<void> {
		if (!history.hasOlder || history.isLoadingOlder || requesting) return;
		requesting = true;
		try {
			if (stick) await stick.preserveViewportWhile(() => history.loadOlder());
			else await history.loadOlder();
		} finally {
			requesting = false;
		}
	}

	$effect(() => {
		if (!sentinel || !history.hasOlder || history.isLoadingOlder || history.loadError) return;
		const node = sentinel;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void requestOlder();
			},
			{ rootMargin: '240px 0px 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<div bind:this={sentinel} class="flex min-h-8 items-center justify-center py-1 text-label">
	{#if history.isLoadingOlder}
		<span class="flex items-center gap-2 text-muted-foreground">
			<Spinner class="size-3.5" /> Memuat pesan lama…
		</span>
	{:else if history.loadError && history.hasOlder}
		<span class="flex items-center gap-2 text-destructive">
			<span>{history.loadError}</span>
			<Button type="button" size="sm" variant="ghost" onclick={requestOlder}>Coba lagi</Button>
		</span>
	{:else if !history.hasOlder}
		<span class="text-muted-foreground">Awal percakapan</span>
	{/if}
</div>
