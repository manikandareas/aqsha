<script lang="ts">
	import { page } from '$app/state';
	import ThreadDetailShell from '$lib/features/thread-experience/components/ThreadDetailShell.svelte';

	// THX-1/2: the full thread experience. `ThreadDetailShell` owns the durable `ThreadAgent`
	// (subscription + replay + reconnect + `/deep` re-attach), the history seed, the rich composer, the
	// message timeline, and the responsive detail-panel slot. The Phase 1/6 throwaway slice is retired.
	const threadId = $derived(page.params.threadId ?? '');
</script>

{#key threadId}
	<ThreadDetailShell {threadId} />
{/key}
