<script lang="ts">
	import { SvelteSet, SvelteURL } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as InputGroup from '@aqsha/ui-svelte/components/input-group';
	import { cn } from '@aqsha/ui-svelte/utils';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { panelBodyColumnClass, panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import { PageTitle } from '$lib/seo';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import {
		Icon,
		FilterIcon,
		LinkIcon,
		MoreHorizontalIcon,
		PenLineIcon,
		PlusIcon,
		Quote,
		SearchIcon,
		UploadIcon,
		XIcon
	} from '$lib/icons';
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
	 * Perpustakaan referensi akun (lintas proyek). Chrome mengikuti board library:
	 * toolbar kompak + empty state terpusat; filter + detail hidup di URL.
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
		const url = new SvelteURL(page.url);
		url.search = applyLibraryUrl(url.searchParams, patch).toString();
		replaceState(resolve('/app/(product)/library') + url.search + url.hash, page.state);
	}

	const list = useCitationsList(
		() => filters,
		() => enabled
	);
	const tags = useCitationTags(() => enabled);
	const copy = useCopyCitation(() => null);

	type DialogKind = 'doi' | 'manual' | 'import' | 'provider' | 'duplicates' | null;
	let dialog = $state<DialogKind>(null);
	let addToProjectId = $state<string | null>(null);
	let editTargetId = $state<string | null>(null);
	let deleteTarget = $state<CitationListItem | null>(null);
	let confirmBulkDelete = $state(false);
	let searchExpanded = $state(false);

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
	const editTarget = useCitationDetail(
		() => editTargetId,
		() => enabled
	);

	const items = $derived<CitationListItem[]>(list.data?.pages.flatMap((p) => p.items) ?? []);
	const total = $derived(list.data?.pages[0]?.total ?? 0);
	const hasFilter = $derived(Boolean(filters.q || filters.status || filters.source || filters.tag));
	const hasActiveTypeFilter = $derived(Boolean(filters.status || filters.source || filters.tag));
	const hasQuery = $derived(filters.q.trim().length > 0);

	// Derived dapat dioverride saat mengetik dan otomatis kembali ke URL saat navigasi berubah.
	let searchDraft = $derived(urlState.q);

	const controlButtonClass =
		'size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground';
	const controlButtonActiveClass = 'bg-primary/10 text-primary hover:text-primary';

	function submitSearch() {
		navigate({ q: searchDraft.trim() });
	}

	function collapseSearch() {
		searchExpanded = false;
	}

	function clearSearch() {
		searchDraft = '';
		navigate({ q: '' });
		collapseSearch();
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
			<header class={cn(panelHeaderBarClass, 'border-b-0')}>
				<div class="flex min-w-0 items-center gap-1.5">
					<h1 class="min-w-0 shrink-0 truncate rounded-md text-base font-semibold text-foreground">
						Perpustakaan
					</h1>
					{#if enabled && !list.isPending}
						<span
							class="hidden rounded-md border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline"
							aria-label={`${total} referensi`}
						>
							{total}
						</span>
					{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="ghost"
									class={controlButtonClass}
									aria-label="Tambah sumber"
								>
									<Icon icon={PlusIcon} class="size-3.5" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-52">
							<DropdownMenu.Item onSelect={() => (dialog = 'import')}>
								<Icon icon={UploadIcon} class="size-4" />
								Import file (.bib/.ris)
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'doi')}>
								<Icon icon={LinkIcon} class="size-4" />
								Dari DOI
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'manual')}>
								<Icon icon={PenLineIcon} class="size-4" />
								Isi manual
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (dialog = 'provider')}>
								<Icon icon={Quote} class="size-4" />
								Mendeley / Zotero
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>

				<div class="flex min-w-0 items-center gap-1">
					{#if searchExpanded}
						<InputGroup.Root
							class="h-7 w-[168px] min-w-0 max-w-[55vw] rounded-full border-border/70 bg-muted/20 shadow-none transition-colors focus-within:border-ring focus-within:bg-background sm:w-[200px] sm:max-w-none"
						>
							<InputGroup.Addon>
								<Icon icon={SearchIcon} class="size-3.5 shrink-0 text-muted-foreground" />
							</InputGroup.Addon>
							<InputGroup.Input
								autofocus
								bind:value={searchDraft}
								placeholder="Cari judul, penulis, DOI…"
								class="h-7 min-w-0 text-[12px]"
								aria-label="Cari referensi"
								onkeydown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										submitSearch();
									}
									if (event.key === 'Escape') {
										clearSearch();
									}
								}}
								onblur={() => {
									if (!hasQuery && !searchDraft.trim()) collapseSearch();
									else if (searchDraft.trim() !== filters.q) submitSearch();
								}}
							/>
							<InputGroup.Addon align="inline-end">
								<button
									type="button"
									onclick={clearSearch}
									aria-label="Bersihkan pencarian"
									class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
								>
									<Icon icon={XIcon} class="size-3" />
								</button>
							</InputGroup.Addon>
						</InputGroup.Root>
					{:else}
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							onclick={() => (searchExpanded = true)}
							class={cn('relative', controlButtonClass, hasQuery && controlButtonActiveClass)}
							aria-label={hasQuery ? `Pencarian aktif: ${filters.q}` : 'Cari referensi'}
						>
							<Icon icon={SearchIcon} class="size-3.5" />
							{#if hasQuery}
								<span
									aria-hidden="true"
									class="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
								></span>
							{/if}
						</Button>
					{/if}

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="ghost"
									size="icon-xs"
									class={cn(controlButtonClass, hasActiveTypeFilter && controlButtonActiveClass)}
									aria-label={hasActiveTypeFilter ? 'Filter aktif' : 'Filter referensi'}
								>
									<Icon icon={FilterIcon} class="size-3.5" />
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
							{#if hasFilter}
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									onSelect={() => navigate({ q: '', status: null, source: null, tag: null })}
								>
									<Icon icon={XIcon} class="size-4" />
									Bersihkan filter
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>

					<span aria-hidden="true" class="mx-0.5 h-4 w-px shrink-0 bg-border/70"></span>

					<CitationExportMenu disabled={items.length === 0} />

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="ghost"
									size="icon-xs"
									class={controlButtonClass}
									aria-label="Opsi lain"
								>
									<Icon icon={MoreHorizontalIcon} class="size-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-44">
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

			<div class={cn(panelBodyColumnClass, 'min-h-0 flex-1 overflow-y-auto')}>
				{#if !enabled || list.isPending}
					<ul class="grid gap-2 px-5 pt-3 pb-8 @2xl:px-6" aria-label="Memuat perpustakaan">
						{#each ['a', 'b', 'c', 'd', 'e', 'f'] as key (key)}
							<li class="flex items-center gap-3 rounded-md border-2 border-border px-4 py-3">
								<Skeleton class="size-2 shrink-0 rounded-full" />
								<div class="min-w-0 flex-1 space-y-2">
									<Skeleton class="h-3.5 w-2/3" />
									<Skeleton class="h-3 w-2/5" />
								</div>
								<Skeleton class="hidden h-5 w-20 sm:block" />
							</li>
						{/each}
					</ul>
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
					<ul class="grid gap-2 px-5 pt-3 pb-8 @2xl:px-6">
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
							class="mx-auto mb-8 flex"
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
