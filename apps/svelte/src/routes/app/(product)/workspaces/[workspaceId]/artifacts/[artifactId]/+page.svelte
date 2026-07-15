<script lang="ts">
	import { page } from '$app/state';
	import ArtifactReaderPageShell from '$lib/features/workspaces/components/ArtifactReaderPageShell.svelte';

	// Route params are decoded by SvelteKit; the shell owns the fixed h-svh frame + fetch.
	const workspaceId = $derived(page.params.workspaceId ?? '');
	const artifactId = $derived(page.params.artifactId ?? '');
</script>

<ArtifactReaderPageShell {workspaceId} {artifactId} />
