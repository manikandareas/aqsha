<script lang="ts">
	import { page } from '$app/state';
	import ThreadDetailShell from '$lib/features/thread-experience/components/ThreadDetailShell.svelte';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';
	import QueryHydrationBoundary from '$lib/query/QueryHydrationBoundary.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const threadId = $derived(page.params.threadId!);
</script>

{#key threadId}
	<QueryHydrationBoundary state={data.threadBootstrap.critical}>
		<ThreadDetailShell
			{threadId}
			initialHistory={data.historySnapshot ?? undefined}
			workspace={{ id: data.workspace.id, name: projectDisplayTitle(data.workspace) }}
		/>
	</QueryHydrationBoundary>
{/key}
