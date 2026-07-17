<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Icon, FilterIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, XIcon } from '$lib/icons';
	import CitationDetailView from '../components/CitationDetailView.svelte';
	import CitationDoiDialog from '../components/CitationDoiDialog.svelte';
	import CitationDuplicatesDialog from '../components/CitationDuplicatesDialog.svelte';
	import CitationEmptyState from '../components/CitationEmptyState.svelte';
	import CitationExportMenu from '../components/CitationExportMenu.svelte';
	import CitationFormDialog from '../components/CitationFormDialog.svelte';
	import CitationImportWizard from '../components/CitationImportWizard.svelte';
	import ProviderSyncWizard from '../components/ProviderSyncWizard.svelte';
	import AddToProjectDialog from '../components/library/AddToProjectDialog.svelte';
	import LibraryBulkBar from '../components/library/LibraryBulkBar.svelte';
	import LibraryRow from '../components/library/LibraryRow.svelte';
	import {
		useBulkDeleteCitations,
		useBulkTagCitations,
		useCitationDetail,
		useCitationsList,
		useCitationTags,
		useCopyCitation,
		useCreateCitation,
		useDeleteCitation,
		useMergeManyCitations,
		useUpdateCitation
	} from '../api';
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

	type DialogKind = 'doi' | 'manual' | 'import' | 'provider' | 'duplicates' | null;
	let dialog = $state<DialogKind>(null);
	let addToProjectId = $state<string | null>(null);
	let editTargetId = $state<string | null>(null);
	let deleteTarget = $state<CitationListItem | null>(null);
	let confirmBulkDelete = $state(false);

	let selectionMode = $state(false);
	const selectedIds = new SvelteSet<string>();
	function clearSelection() {
		selectionMode = false;
		selectedIds.clear();
	}

	const createCitation = useCreateCitation();
	const updateCitation = useUpdateCitation();
	const deleteCitation = useDeleteCitation();
	const bulkTag = useBulkTagCitations();
	const bulkDelete = useBulkDeleteCitations();
	const mergeMany = useMergeManyCitations();
	// `useCitationDetail` gates its own query on the id being non-null — no separate `enabled` getter.
	const editTarget = useCitationDetail(() => editTargetId);

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
				<div class="flex items-center gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} type="button" class="gap-1.5">
									<Icon icon={PlusIcon} class="size-4" /> Tambah sumber
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={() => (dialog = 'doi')}>Dari DOI</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'manual')}>Isi manual</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'import')}>
								Import file (.bib/.ris)
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'provider')}>
								Tarik dari Mendeley/Zotero
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<CitationExportMenu disabled={items.length === 0} />
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="outline"
									size="icon"
									aria-label="Opsi lain"
								>
									<Icon icon={MoreHorizontalIcon} class="size-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={() => (selectionMode = true)}>
								Pilih beberapa
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'duplicates')}>
								Kelola duplikat
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
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
						onImportFile={() => (dialog = 'import')}
						onAddByDoi={() => (dialog = 'doi')}
						onAddManual={() => (dialog = 'manual')}
					/>
				{:else if items.length === 0}
					<p class="py-16 text-center text-sm text-muted-foreground">
						Tidak ada referensi yang cocok dengan filter.
					</p>
				{:else}
					<ul class="grid gap-2">
						{#each items as item (item.id)}
							<LibraryRow
								{item}
								{selectionMode}
								selected={selectedIds.has(item.id)}
								onToggleSelect={() =>
									selectedIds.has(item.id) ? selectedIds.delete(item.id) : selectedIds.add(item.id)}
								onOpen={() => navigate({ cite: item.id })}
								onCopy={() => copy.mutate(item.id)}
								onAddToProject={() => (addToProjectId = item.id)}
								onEdit={() => (editTargetId = item.id)}
								onDelete={() => (deleteTarget = item)}
							/>
						{/each}
					</ul>
					{#if selectionMode && selectedIds.size > 0}
						<LibraryBulkBar
							ids={[...selectedIds]}
							onTag={(newTags) =>
								bulkTag.mutate(
									{ ids: [...selectedIds], tags: newTags },
									{ onSuccess: clearSelection }
								)}
							onMerge={() =>
								mergeMany.mutate({ ids: [...selectedIds] }, { onSuccess: clearSelection })}
							onDelete={() => (confirmBulkDelete = true)}
							onClear={clearSelection}
						/>
					{/if}
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

<CitationDoiDialog
	open={dialog === 'doi'}
	onOpenChange={(open) => (dialog = open ? 'doi' : null)}
	onSubmit={async (value) => {
		await createCitation.mutateAsync({ doi: value.doi, allowDuplicate: value.allowDuplicate });
		dialog = null;
	}}
/>
<CitationFormDialog
	open={dialog === 'manual' || editTargetId !== null}
	citation={editTargetId !== null ? (editTarget.data ?? null) : null}
	onOpenChange={(open) => {
		if (!open) {
			dialog = dialog === 'manual' ? null : dialog;
			editTargetId = null;
		}
	}}
	onSubmit={async (value) => {
		if (editTargetId) {
			await updateCitation.mutateAsync({ citationId: editTargetId, ...value });
			editTargetId = null;
		} else {
			await createCitation.mutateAsync(value);
			dialog = null;
		}
	}}
/>
<CitationImportWizard
	open={dialog === 'import'}
	onOpenChange={(open) => (dialog = open ? 'import' : null)}
	onDone={() => (dialog = null)}
/>
<ProviderSyncWizard
	open={dialog === 'provider'}
	onOpenChange={(open) => (dialog = open ? 'provider' : null)}
	onDone={() => (dialog = null)}
/>
<CitationDuplicatesDialog
	open={dialog === 'duplicates'}
	onOpenChange={(open) => (dialog = open ? 'duplicates' : null)}
/>
<AddToProjectDialog
	open={addToProjectId !== null}
	onOpenChange={(open) => {
		if (!open) addToProjectId = null;
	}}
	citationId={addToProjectId}
/>
<ConfirmDialog
	open={deleteTarget !== null}
	onOpenChange={(open) => {
		if (!open) deleteTarget = null;
	}}
	title="Hapus referensi?"
	description={`"${deleteTarget?.title ?? ''}" dihapus dari perpustakaan (bisa dilihat lagi lewat filter di masa depan — soft delete).`}
	confirmLabel="Hapus"
	onConfirm={async () => {
		if (!deleteTarget) return;
		await deleteCitation.mutateAsync(deleteTarget.id);
		if (urlState.cite === deleteTarget.id) navigate({ cite: null });
		deleteTarget = null;
	}}
/>
<ConfirmDialog
	open={confirmBulkDelete}
	onOpenChange={(open) => (confirmBulkDelete = open)}
	title={`Hapus ${selectedIds.size} referensi?`}
	description="Referensi terpilih dihapus dari perpustakaan."
	confirmLabel="Hapus"
	onConfirm={async () => {
		await bulkDelete.mutateAsync([...selectedIds]);
		confirmBulkDelete = false;
		clearSelection();
	}}
/>
