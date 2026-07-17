<script lang="ts">
	import { page } from '$app/state';
	import ProjectHomePage from '$lib/features/workspaces/pages/ProjectHomePage.svelte';

	const projectId = $derived(page.params.projectId!);
</script>

{#key projectId}
	<ProjectHomePage workspaceId={projectId} />
{/key}
