<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, FilterIcon, SearchIcon, XIcon } from '$lib/icons';
	import CitationDetailView from '../components/CitationDetailView.svelte';
	import CitationEmptyState from '../components/CitationEmptyState.svelte';
	import LibraryRow from '../components/library/LibraryRow.svelte';
	import { useCitationsList, useCitationTags, useCopyCitation } from '../api';
	import { CITATION_SOURCE_LABELS, CITATION_STATUS_LABELS, type CitationListItem } from '../types';
	import { applyLibraryUrl, readLibraryUrl, type LibraryUrlState } from '../library-url-model';

	/**
	 * Perpustakaan referensi akun (lintas proyek). Filter + detail hidup di URL;
	 * file/PDF tetap aset per proyek — halaman ini murni referensi.
	 */
	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const urlState = $derived(readLibraryUrl(page.url.searchParams));
	const filters = $derived({
		q: urlState.q,
		status: urlState.status,
		source: urlState.source,
		tag: urlState.tag
	});

	function navigate(patch: Partial<LibraryUrlState>): void {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient URL builder, not reactive state
		const url = new URL(page.url);
		url.search = applyLibraryUrl(url.searchParams, patch).toString();
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const list = useCitationsList(() => filters);
	const tags = useCitationTags();
	const copy = useCopyCitation(() => null);

	const items = $derived<CitationListItem[]>(list.data?.pages.flatMap((p) => p.items) ?? []);
	const total = $derived(list.data?.pages[0]?.total ?? 0);
	const hasFilter = $derived(Boolean(filters.q || filters.status || filters.source || filters.tag));

	// Draft input stays locally editable while typing; only overwritten when the URL `q`
	// changes from outside (back/forward, "bersihkan filter") — guarded so it doesn't
	// clobber the keystroke that is about to submit it.
	let searchDraft = $state(untrack(() => urlState.q));
	let lastQ = untrack(() => urlState.q);
	$effect(() => {
		if (urlState.q !== lastQ) {
			lastQ = urlState.q;
			searchDraft = urlState.q;
		}
	});
	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		navigate({ q: searchDraft.trim() });
	}
</script>

<PageTitle title="Perpustakaan" />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout
		sideOpen={urlState.cite !== null}
		onSideOpenChange={(open) => {
			if (!open) navigate({ cite: null });
		}}
	>
		{#snippet main()}
			<header
				class="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border px-6 py-4"
			>
				<div>
					<h1 class="font-heading text-2xl font-bold">Perpustakaan</h1>
					<p class="text-sm text-muted-foreground">
						{total} referensi lintas proyek — tambahkan ke proyek kapan pun.
					</p>
				</div>
				<!-- Slot aksi header: tambah sumber, export, kelola duplikat, mode pilih -->
			</header>

			<div class="flex flex-wrap items-center gap-2 px-6 py-3">
				<form class="flex min-w-56 flex-1 items-center gap-2" onsubmit={submitSearch}>
					<Input
						bind:value={searchDraft}
						placeholder="Cari judul, penulis, DOI…"
						aria-label="Cari referensi"
					/>
					<Button type="submit" variant="outline" size="icon" aria-label="Cari">
						<Icon icon={SearchIcon} class="size-4" />
					</Button>
				</form>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="outline" size="sm" class="gap-1.5">
								<Icon icon={FilterIcon} class="size-3.5" /> Filter
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>Status</DropdownMenu.GroupHeading>
							{#each Object.entries(CITATION_STATUS_LABELS) as [value, label] (value)}
								<DropdownMenu.CheckboxItem
									checked={filters.status === value}
									onCheckedChange={(checked) =>
										navigate({ status: checked ? (value as LibraryUrlState['status']) : null })}
								>
									{label}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.GroupHeading>Sumber</DropdownMenu.GroupHeading>
							{#each Object.entries(CITATION_SOURCE_LABELS) as [value, label] (value)}
								<DropdownMenu.CheckboxItem
									checked={filters.source === value}
									onCheckedChange={(checked) =>
										navigate({ source: checked ? (value as LibraryUrlState['source']) : null })}
								>
									{label}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Group>
						{#if (tags.data ?? []).length > 0}
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.GroupHeading>Tag</DropdownMenu.GroupHeading>
								{#each tags.data ?? [] as tag (tag)}
									<DropdownMenu.CheckboxItem
										checked={filters.tag === tag}
										onCheckedChange={(checked) => navigate({ tag: checked ? tag : null })}
									>
										{tag}
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Group>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				{#if hasFilter}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="gap-1 text-muted-foreground"
						onclick={() => navigate({ q: '', status: null, source: null, tag: null })}
					>
						<Icon icon={XIcon} class="size-3.5" /> Bersihkan filter
					</Button>
				{/if}
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
				{#if !enabled || list.isPending}
					<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat perpustakaan…</span>
					</div>
				{:else if items.length === 0 && !hasFilter}
					<CitationEmptyState
						onImportFile={() => {}}
						onAddByDoi={() => {}}
						onAddManual={() => {}}
					/>
					<!-- Callback empty state menautkan ke dialog impor file, tambah DOI, dan tambah manual -->
				{:else if items.length === 0}
					<p class="py-16 text-center text-sm text-muted-foreground">
						Tidak ada referensi yang cocok dengan filter.
					</p>
				{:else}
					<ul class="grid gap-2">
						{#each items as item (item.id)}
							<LibraryRow
								{item}
								selectionMode={false}
								selected={false}
								onToggleSelect={() => {}}
								onOpen={() => navigate({ cite: item.id })}
								onCopy={() => copy.mutate(item.id)}
								onAddToProject={() => {}}
								onEdit={() => {}}
								onDelete={() => {}}
							/>
						{/each}
					</ul>
					{#if list.hasNextPage}
						<Button
							type="button"
							variant="outline"
							class="mx-auto mt-4 flex"
							disabled={list.isFetchingNextPage}
							onclick={() => list.fetchNextPage()}
						>
							{list.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
						</Button>
					{/if}
				{/if}
			</div>
		{/snippet}
		{#snippet side()}
			{#if urlState.cite}
				{#key urlState.cite}
					<CitationDetailView
						workspaceId={null}
						citationId={urlState.cite}
						onBack={() => navigate({ cite: null })}
					/>
				{/key}
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>
