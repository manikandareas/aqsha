<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import { useArtifactDetailData } from '$lib/features/workspaces/api/use-workspaces-data';
	import ArtifactDetailView from './ArtifactDetailView.svelte';

	/**
	 * Standalone artifact reader page shell. Owns the fixed `h-svh` frame (so the reader's inner
	 * `overflow-y-auto` works — see the DetailSplitLayout `h-svh`-ancestor gotcha), fetches the artifact
	 * via `useArtifactDetailData(() => artifactId)`, and passes the data DOWN to `ArtifactDetailView`
	 * (variant="page"). Astra chat was removed here — research chat lives inside a project now.
	 */
	let { workspaceId, artifactId }: { workspaceId: string; artifactId: string } = $props();

	const data = useArtifactDetailData(() => artifactId);

	// Tab title: the loaded artifact title (nested one level under the composite), else "Workspaces".
	const pageTitle = $derived(data.artifact?.artifact?.title ?? 'Workspaces');
</script>

<PageTitle title={pageTitle} />

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<div class="min-h-0 flex-1 overflow-y-auto">
		<ArtifactDetailView {data} {artifactId} {workspaceId} variant="page" />
	</div>
</main>
