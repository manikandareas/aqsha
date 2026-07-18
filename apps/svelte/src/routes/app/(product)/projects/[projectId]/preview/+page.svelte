<script lang="ts">
	import { page } from '$app/state';
	import ProjectPreviewPage from '$lib/features/workspaces/pages/ProjectPreviewPage.svelte';
</script>

<ProjectPreviewPage projectId={page.params.projectId!} />
