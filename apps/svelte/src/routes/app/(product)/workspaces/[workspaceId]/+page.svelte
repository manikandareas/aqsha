<script lang="ts">
	import { page } from '$app/state';
	import WorkspaceDetailClient from '$lib/features/workspaces/components/WorkspaceDetailClient.svelte';

	const workspaceId = $derived(page.params.workspaceId ?? '');
</script>

{#key workspaceId}
	<WorkspaceDetailClient {workspaceId} />
{/key}
