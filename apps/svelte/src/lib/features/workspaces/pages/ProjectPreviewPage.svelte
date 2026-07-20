<script lang="ts">
	import { resolve } from '$app/paths';
	import { PageTitle } from '$lib/seo';
	import ProjectDocumentViewer from '../components/ProjectDocumentViewer.svelte';

	/**
	 * Pratinjau dokumen penuh: PDF hasil compile seluruh bab + daftar pustaka, tanpa anotasi.
	 * Compile full lebih mahal dari per-bab, jadi TIDAK auto-compile — user memicu eksplisit.
	 */
	let { projectId }: { projectId: string } = $props();

	const backHref = $derived(resolve('/app/(product)/projects/[projectId]', { projectId }));
</script>

<PageTitle title="Pratinjau dokumen" />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<ProjectDocumentViewer {projectId} {backHref} heading="Pratinjau dokumen" />
</div>
