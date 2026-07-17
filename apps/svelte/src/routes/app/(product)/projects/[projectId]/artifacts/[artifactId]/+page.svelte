<script lang="ts">
	import { page } from '$app/state';
	import ArtifactReaderPageShell from '$lib/features/workspaces/components/ArtifactReaderPageShell.svelte';

	// Route params are decoded by SvelteKit; the shell owns the fixed h-svh frame + fetch.
	// The project id IS the workspace id — the reader shell is workspace-scoped underneath.
	const workspaceId = $derived(page.params.projectId ?? '');
	const artifactId = $derived(page.params.artifactId ?? '');
</script>

<ArtifactReaderPageShell {workspaceId} {artifactId} />
