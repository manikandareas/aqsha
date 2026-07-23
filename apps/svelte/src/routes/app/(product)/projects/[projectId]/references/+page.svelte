<script lang="ts">
	import LibraryPage from '$lib/features/citations/pages/LibraryPage.svelte';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const scope = $derived({
		kind: 'project' as const,
		workspaceId: data.workspace.id,
		workspaceName: projectDisplayTitle(data.workspace)
	});
</script>

{#key data.workspace.id}
	<LibraryPage {scope} />
{/key}
