<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { SvelteSet } from 'svelte/reactivity';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import ExploreAskBar from '$lib/features/explore/components/ExploreAskBar.svelte';
	import SourceResultCard from '$lib/features/discovery/components/SourceResultCard.svelte';
	import { usePaperSearch, useRecordInteraction, type SearchPaper } from '$lib/features/discovery/api';
	import { useSaveSource } from '$lib/features/citations/api';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';

	/**
	 * Pencarian sumber sadar-konteks: hasil disimpan langsung ke perpustakaan akun
	 * + auto-link ke proyek ini (dan bab bila datang dari aksi per-bab).
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const q = $derived(page.url.searchParams.get('q') ?? '');
	const sectionId = $derived(page.url.searchParams.get('section'));

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const sections = useSections(
		() => workspaceId,
		() => enabled
	);
	const section = $derived(
		sectionId ? (sections.data?.find((s) => s.id === sectionId) ?? null) : null
	);

	const search = usePaperSearch(
		() => q,
		() => undefined,
		() => enabled && q.trim().length > 0
	);
	const results = $derived<SearchPaper[]>(search.data?.pages.flatMap((p) => p.items) ?? []);

	const saveSource = useSaveSource();
	const record = useRecordInteraction();
	const savedKeys = new SvelteSet<string>();
	let pendingKey = $state<string | null>(null);

	function save(paper: SearchPaper) {
		pendingKey = paper.key;
		saveSource.mutate(
			{
				source: {
					title: paper.title,
					doi: paper.doi ?? null,
					url: paper.url ?? null,
					authors: paper.authors,
					year: paper.year ?? null,
					venue: paper.venue ?? null
				},
				workspaceId,
				sectionId
			},
			{
				onSuccess: () => {
					savedKeys.add(paper.key);
					record.mutate({ itemRef: { kind: 'paper', paperKey: paper.key }, kind: 'save' });
				},
				onSettled: () => (pendingKey = null)
			}
		);
	}

	function submitQuery(next: string) {
		const url = new URL(page.url);
		if (next.trim()) url.searchParams.set('q', next.trim());
		else url.searchParams.delete('q');
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Saran query awal dari konteks proyek/bab — pencarian belum dimulai.
	const suggestions = $derived(
		[
			section?.title ?? null,
			workspace.data?.topicNote?.trim() || null,
			workspace.data?.name.trim() || null
		].filter((s, i, all): s is string => Boolean(s) && all.indexOf(s) === i)
	);
</script>

<PageTitle title="Cari sumber" />

<div class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<header class="flex flex-col gap-3 border-b-2 border-border px-6 py-4">
		<div class="flex flex-wrap items-center gap-2">
			<Button
				href={resolve('/app/(product)/projects/[projectId]', { projectId: workspaceId })}
				variant="ghost"
				size="sm"
				class="gap-1.5 text-muted-foreground"
			>
				<Icon icon={ArrowLeftIcon} class="size-3.5" /> Kembali ke proyek
			</Button>
			{#if workspace.data}
				<Badge variant="outline">{projectDisplayTitle(workspace.data)}</Badge>
			{/if}
			{#if section}
				<Badge variant="secondary">{section.title}</Badge>
			{/if}
		</div>
		<h1 class="font-heading text-2xl font-bold">
			Cari sumber {section ? `untuk ${section.title}` : 'untuk proyek ini'}
		</h1>
		<ExploreAskBar value={q} onSubmit={submitQuery} />
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
		{#if !q.trim()}
			<div class="grid gap-3">
				<p class="text-sm text-muted-foreground">Mulai dari topikmu:</p>
				<div class="flex flex-wrap gap-2">
					{#each suggestions as suggestion (suggestion)}
						<Button type="button" variant="outline" size="sm" onclick={() => submitQuery(suggestion)}>
							{suggestion}
						</Button>
					{/each}
				</div>
			</div>
		{:else if search.isPending}
			<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
				<Spinner class="size-4" />
				<span class="text-sm">Mencari literatur…</span>
			</div>
		{:else if results.length === 0}
			<p class="py-16 text-center text-sm text-muted-foreground">
				Tidak ada hasil — coba kata kunci lain atau lebih spesifik.
			</p>
		{:else}
			<div class="grid gap-3">
				{#each results as paper (paper.key)}
					<SourceResultCard
						{paper}
						saved={savedKeys.has(paper.key)}
						pending={pendingKey === paper.key}
						onSave={() => save(paper)}
					/>
				{/each}
			</div>
			{#if search.hasNextPage}
				<Button
					type="button"
					variant="outline"
					class="mx-auto mt-4 flex"
					disabled={search.isFetchingNextPage}
					onclick={() => search.fetchNextPage()}
				>
					{search.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
				</Button>
			{/if}
		{/if}
	</div>
</div>
