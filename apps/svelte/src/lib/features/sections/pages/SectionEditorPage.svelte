<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import ProjectSidePanel from '$lib/features/workspaces/components/ProjectSidePanel.svelte';
	import { useSections, useWorkspace } from '$lib/features/workspaces/api';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';
	import { useSectionDocument } from '../api';
	import BibliographyView from '../components/BibliographyView.svelte';

	/**
	 * Halaman bab (stub read-only): tampilkan status sumber LaTeX bab + panel proyek.
	 * Penyuntingan LaTeX dan viewer PDF menyusul di fase editor berikutnya; bab
	 * bibliography tetap merender daftar pustaka.
	 */
	let { projectId, sectionId }: { projectId: string; sectionId: string } = $props();

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const document = useSectionDocument(() => sectionId);

	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
	const isBibliography = $derived(section?.role === 'bibliography');

	let panelTab = $state<'chat' | 'sources'>('sources');
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={true} onSideOpenChange={() => {}}>
		{#snippet main()}
			<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
				{#if sections.isPending}
					<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat bab…</span>
					</div>
				{:else if !section}
					<p class="text-muted-foreground">Bab tidak ditemukan.</p>
				{:else}
					<header class="flex flex-wrap items-center gap-3">
						<Button
							href={resolve('/app/(product)/projects/[projectId]', { projectId })}
							variant="ghost"
							size="icon"
							aria-label="Kembali ke proyek"
						>
							<Icon icon={ArrowLeftIcon} class="size-4" />
						</Button>
						<div class="min-w-0 flex-1">
							<h1 class="truncate font-heading text-xl font-bold">{section.title}</h1>
							<p class="truncate text-label text-muted-foreground">
								{workspace.data ? projectDisplayTitle(workspace.data) : ''}
							</p>
						</div>
						{#if isBibliography}
							<Badge variant="outline">otomatis</Badge>
						{:else if document.data}
							<Badge variant="outline">Sumber v{document.data.contentVersion}</Badge>
						{/if}
					</header>

					{#if isBibliography}
						<BibliographyView workspaceId={projectId} />
					{:else if document.isPending}
						<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
							<Spinner class="size-4" />
							<span class="text-sm">Memuat bab…</span>
						</div>
					{:else}
						<div
							class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-card p-8 text-center"
						>
							<p class="text-sm text-muted-foreground">
								{document.data ? 'Sumber LaTeX bab tersimpan.' : 'Bab ini belum ditulis.'}
							</p>
							<p class="text-label text-muted-foreground">
								Viewer PDF dan penyuntingan hadir di fase berikutnya.
							</p>
						</div>
					{/if}
				{/if}
			</div>
		{/snippet}
		{#snippet side()}
			{#if workspace.data && sections.data}
				<ProjectSidePanel
					workspaceId={projectId}
					workspaceName={projectDisplayTitle(workspace.data)}
					sections={sections.data}
					activeTab={panelTab}
					onTabChange={(t) => (panelTab = t)}
					onClose={() => {}}
				/>
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>
