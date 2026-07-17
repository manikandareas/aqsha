<script lang="ts">
	import { page } from '$app/state';
	import ProjectSearchPage from '$lib/features/workspaces/pages/ProjectSearchPage.svelte';

	const projectId = $derived(page.params.projectId!);
</script>

{#key projectId}
	<ProjectSearchPage workspaceId={projectId} />
{/key}
