<script lang="ts">
	import { SvelteSet, SvelteURL } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as InputGroup from '@aqsha/ui-svelte/components/input-group';
	import { cn } from '@aqsha/ui-svelte/utils';
	import AppPageHeader from '$lib/components/layout/AppPageHeader.svelte';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { panelBodyColumnClass } from '$lib/components/layout/panel-surface';
	import { PageTitle } from '$lib/seo';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { readableApiErrorMessage } from '$lib/errors';
	import {
		Icon,
		FileTextIcon,
		FilterIcon,
		FolderIcon,
		LinkIcon,
		MoreHorizontalIcon,
		PenLineIcon,
		PlusIcon,
		Quote,
		SearchIcon,
		UnlinkIcon,
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
	import AddFromLibraryDialog from '../components/library/AddFromLibraryDialog.svelte';
	import AddToProjectDialog from '../components/library/AddToProjectDialog.svelte';
	import LibraryBulkBar from '../components/library/LibraryBulkBar.svelte';
	import LibraryListSkeleton from '../components/library/LibraryListSkeleton.svelte';
	import LibraryRow from '../components/library/LibraryRow.svelte';
	import {
		useBulkDeleteCitations,
		useBulkTagCitations,
		useBulkUnlinkCitations,
		useCitationDetail,
		useCitationsList,
		useCitationTags,
		useCopyCitation,
		useCreateCitation,
		useDeleteCitation,
		useMergeManyCitations,
		useUnlinkCitation,
		useUpdateCitation,
		useUploadLibraryPdf
	} from '../api';
	import { CITATION_SOURCE_LABELS, CITATION_STATUS_LABELS, type CitationListItem } from '../types';
	import { applyLibraryUrl, readLibraryUrl, type LibraryUrlState } from '../library-url-model';
	import {
		libraryBasePath,
		libraryTitle,
		libraryWorkspaceId,
		type LibraryScope
	} from '../library-scope';

	/**
	 * Perpustakaan referensi — akun (lintas proyek) atau koleksi satu proyek, dipilih lewat
	 * `scope`. Chrome mengikuti board library: toolbar kompak + empty state terpusat; filter +
	 * detail hidup di URL. Isi utama adalah grid kartu index berwarna. Scope proyek menambah
	 * header breadcrumb dan mengganti aksi keanggotaan/hapus massal dengan varian
	 * "lepas dari proyek".
	 */
	let { scope }: { scope: LibraryScope } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	const workspaceId = $derived(libraryWorkspaceId(scope));
	const basePath = $derived(libraryBasePath(scope));
	const projectScope = $derived(scope.kind === 'project');

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
		replaceState(basePath + url.search + url.hash, page.state);
	}

	const list = useCitationsList(
		() => filters,
		() => enabled,
		() => workspaceId
	);
	const tags = useCitationTags(
		() => enabled,
		() => workspaceId
	);
	const copy = useCopyCitation(() => workspaceId);

	type DialogKind =
		'doi' | 'manual' | 'import' | 'provider' | 'duplicates' | 'addFromLibrary' | null;
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

	const createCitation = useCreateCitation(() => workspaceId);
	const uploadPdf = useUploadLibraryPdf();
	let fileInputEl = $state<HTMLInputElement | null>(null);

	function pickPdf() {
		fileInputEl?.click();
	}

	function uploadFiles(files: File[]) {
		for (const file of files) uploadPdf.mutate(file);
	}

	const updateCitation = useUpdateCitation();
	const deleteCitation = useDeleteCitation();
	const bulkTag = useBulkTagCitations();
	const bulkDelete = useBulkDeleteCitations();
	const bulkUnlink = useBulkUnlinkCitations();
	const unlinkCitation = useUnlinkCitation();
	const mergeMany = useMergeManyCitations();
	const editTarget = useCitationDetail(
		() => editTargetId,
		() => enabled,
		() => workspaceId
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

	/** Aksi keanggotaan baris: tambahkan (global) vs lepas dari proyek aktif (project). */
	function membershipActionFor(item: CitationListItem) {
		if (workspaceId) {
			const ws = workspaceId;
			return {
				label: 'Lepas dari proyek',
				icon: UnlinkIcon,
				run: () =>
					unlinkCitation.mutate(
						{ workspaceId: ws, citationId: item.id },
						{
							onSuccess: () => {
								if (urlState.cite === item.id) navigate({ cite: null });
							}
						}
					)
			};
		}
		return {
			label: 'Tambahkan ke proyek',
			icon: FolderIcon,
			run: () => (addToProjectId = item.id)
		};
	}
</script>

<PageTitle title={libraryTitle(scope)} />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout
		sideOpen={urlState.cite !== null}
		onSideOpenChange={(open) => {
			if (!open) navigate({ cite: null });
		}}
	>
		{#snippet main()}
			<AppPageHeader class="border-b-0">
				{#snippet title()}
					{#if scope.kind === 'project'}
						<a
							href={resolve('/app/(product)/library')}
							class="shrink-0 rounded-md text-base font-semibold text-muted-foreground transition-colors hover:text-foreground hover:underline"
						>
							Perpustakaan
						</a>
						<span aria-hidden="true" class="shrink-0 text-base font-semibold text-muted-foreground">
							/
						</span>
						<h1 class="min-w-0 truncate rounded-md text-base font-semibold text-foreground">
							{scope.workspaceName}
						</h1>
					{:else}
						<h1
							class="min-w-0 shrink-0 truncate rounded-md text-base font-semibold text-foreground"
						>
							Perpustakaan
						</h1>
					{/if}
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
							{#if projectScope}
								<DropdownMenu.Item onSelect={() => (dialog = 'addFromLibrary')}>
									<Icon icon={FolderIcon} class="size-4" />
									Dari Perpustakaan
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
							{/if}
							<DropdownMenu.Item onSelect={pickPdf}>
								<Icon icon={UploadIcon} class="size-4" />
								Unggah PDF
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => (dialog = 'import')}>
								<Icon icon={FileTextIcon} class="size-4" />
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
				{/snippet}
				{#snippet actions()}
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

					<CitationExportMenu disabled={items.length === 0} {workspaceId} />

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
							{#if !projectScope}
								<DropdownMenu.Item onSelect={() => (dialog = 'duplicates')}>
									Kelola duplikat
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</AppPageHeader>

			<div class={cn(panelBodyColumnClass, 'min-h-0 flex-1 overflow-y-auto')}>
				{#if !enabled || list.isPending}
					<LibraryListSkeleton />
				{:else if list.isError}
					<div class="grid place-items-center gap-3 py-16 text-center">
						<p class="max-w-sm text-[13px] font-medium text-destructive">
							{readableApiErrorMessage(list.error, 'Perpustakaan tidak dapat dimuat')}
						</p>
						<Button type="button" variant="outline" onclick={() => list.refetch()}>Coba lagi</Button
						>
					</div>
				{:else if items.length === 0 && !hasFilter}
					<CitationEmptyState
						{scope}
						onAddFromLibrary={() => (dialog = 'addFromLibrary')}
						onUploadPdf={pickPdf}
						onImportFile={() => (dialog = 'import')}
						onAddByDoi={() => (dialog = 'doi')}
						onAddManual={() => (dialog = 'manual')}
					/>
				{:else if items.length === 0}
					<p class="py-16 text-center text-sm text-muted-foreground">
						Tidak ada referensi yang cocok dengan filter.
					</p>
				{:else}
					<ul
						class="grid grid-cols-1 gap-4 px-5 pt-4 pb-8 @md:grid-cols-2 @2xl:gap-5 @2xl:px-6 @3xl:grid-cols-3 @5xl:grid-cols-4 @[84rem]:grid-cols-5"
					>
						{#each items as item (item.id)}
							<LibraryRow
								{item}
								{selectionMode}
								selected={selectedIds.has(item.id)}
								onToggleSelect={() =>
									selectedIds.has(item.id) ? selectedIds.delete(item.id) : selectedIds.add(item.id)}
								onOpen={() => navigate({ cite: item.id })}
								onCopy={() => copy.mutate(item.id)}
								membershipAction={membershipActionFor(item)}
								onEdit={() => (editTargetId = item.id)}
								onDelete={() => (deleteTarget = item)}
							/>
						{/each}
					</ul>
					{#if selectionMode && selectedIds.size > 0}
						<LibraryBulkBar
							ids={[...selectedIds]}
							destructiveLabel={projectScope ? 'Lepas dari proyek' : 'Hapus dari Perpustakaan'}
							{workspaceId}
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
						{workspaceId}
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
	{workspaceId}
/>
<ProviderSyncWizard
	open={dialog === 'provider'}
	onOpenChange={(open) => (dialog = open ? 'provider' : null)}
	onDone={() => (dialog = null)}
	{workspaceId}
/>
<CitationDuplicatesDialog
	open={dialog === 'duplicates'}
	onOpenChange={(open) => (dialog = open ? 'duplicates' : null)}
/>
{#if !projectScope}
	<AddToProjectDialog
		open={addToProjectId !== null}
		onOpenChange={(open) => {
			if (!open) addToProjectId = null;
		}}
		citationId={addToProjectId}
	/>
{/if}
{#if workspaceId}
	<AddFromLibraryDialog
		open={dialog === 'addFromLibrary'}
		onOpenChange={(open) => (dialog = open ? 'addFromLibrary' : null)}
		{workspaceId}
	/>
{/if}
<ConfirmDialog
	open={deleteTarget !== null}
	onOpenChange={(open) => {
		if (!open) deleteTarget = null;
	}}
	title="Hapus dari Perpustakaan?"
	description={projectScope
		? `"${deleteTarget?.title ?? ''}" akan hilang dari perpustakaan dan dari setiap proyek yang menautkannya.`
		: `"${deleteTarget?.title ?? ''}" dihapus dari perpustakaan (bisa dilihat lagi lewat filter di masa depan — soft delete).`}
	confirmLabel="Hapus dari Perpustakaan"
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
	title={projectScope
		? `Lepas ${selectedIds.size} referensi dari proyek?`
		: `Hapus ${selectedIds.size} referensi?`}
	description={projectScope
		? 'Referensi tetap ada di perpustakaan akun; hanya tautan ke proyek ini yang dihapus.'
		: 'Referensi terpilih dihapus dari perpustakaan.'}
	confirmLabel={projectScope ? 'Lepas dari proyek' : 'Hapus dari Perpustakaan'}
	onConfirm={async () => {
		if (projectScope && workspaceId) {
			await bulkUnlink.mutateAsync({ workspaceId, ids: [...selectedIds] });
		} else {
			await bulkDelete.mutateAsync([...selectedIds]);
		}
		if (urlState.cite && selectedIds.has(urlState.cite)) navigate({ cite: null });
		confirmBulkDelete = false;
		clearSelection();
	}}
/>

<!-- Dipicu aksi "Unggah PDF" (dropdown, empty state, dan context menu latar). -->
<input
	bind:this={fileInputEl}
	type="file"
	accept="application/pdf"
	multiple
	class="hidden"
	onchange={(event) => {
		const files = [...(event.currentTarget.files ?? [])];
		event.currentTarget.value = '';
		uploadFiles(files);
	}}
/>
