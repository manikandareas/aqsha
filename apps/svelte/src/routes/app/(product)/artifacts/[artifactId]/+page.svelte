<script lang="ts">
	import { page } from '$app/state';
	import ArtifactReaderPageShell from '$lib/features/workspaces/components/ArtifactReaderPageShell.svelte';

	// Paper hidup di level akun, jadi reader tak mensyaratkan proyek. Query `project`
	// hanya menandai asal navigasi (breadcrumb/nama proyek), bukan syarat memuat.
	const artifactId = $derived(page.params.artifactId ?? '');
	const originProject = $derived(page.url.searchParams.get('project'));
</script>

<ArtifactReaderPageShell workspaceId={originProject} {artifactId} />
