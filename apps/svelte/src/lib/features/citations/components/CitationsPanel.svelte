<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import {
		BookmarkIcon,
		CheckIcon,
		CopyIcon,
		ExternalLinkIcon,
		FilterIcon,
		Icon,
		LayersIcon,
		LinkIcon,
		MoreHorizontalIcon,
		PencilIcon,
		PenLineIcon,
		PlugIcon,
		PlusIcon,
		SearchIcon,
		SettingsIcon,
		Trash2Icon,
		UploadIcon
	} from '$lib/icons';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '@aqsha/ui-svelte/utils';
	import {
		type CitationListFilters,
		EMPTY_CITATION_FILTERS,
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
	import {
		CITATION_SOURCE_LABELS,
		CITATION_STATUS_LABELS,
		type CitationListItem,
		citationMetaLine
	} from '../types';
	import CitationDetailView from './CitationDetailView.svelte';
	import CitationDoiDialog from './CitationDoiDialog.svelte';
	import CitationDuplicatesDialog from './CitationDuplicatesDialog.svelte';
	import CitationEmptyState from './CitationEmptyState.svelte';
	import CitationExportMenu from './CitationExportMenu.svelte';
	import CitationFormDialog from './CitationFormDialog.svelte';
	import CitationImportWizard from './CitationImportWizard.svelte';
	import CitationSettingsDialog from './CitationSettingsDialog.svelte';
	import ProviderSyncWizard from './ProviderSyncWizard.svelte';

	/**
	 * Konten tab Sitasi pada panel kanan workspace detail. List mode (default) ↔
	 * sub-view detail (`citationId` dari mode panel). Search/filter = state lokal
	 * (BUKAN URL — jangan bentrok dengan `q` milik board). Responsivitas internal
	 * memakai container variants (`@3xl:`) karena kolom panel = @container.
	 */
	let {
		workspaceId,
		citationId,
		onOpenCitation,
		onBackToList,
		onAddToChat
	}: {
		workspaceId: string;
		citationId: string | null;
		onOpenCitation: (citationId: string) => void;
		onBackToList: () => void;
		/** Sematkan referensi sebagai konteks chip composer chat (opsional). */
		onAddToChat?: (citation: { id: string; title: string }) => void;
	} = $props();

	type DialogKind = 'import' | 'doi' | 'manual' | 'settings' | 'duplicates' | 'provider' | null;

	const STATUS_OPTIONS = [
		{ id: 'verified', label: 'Terverifikasi' },
		{ id: 'needs_review', label: 'Perlu review' },
		{ id: 'incomplete', label: 'Belum lengkap' }
	] as const;
	const SOURCE_OPTIONS = [
		{ id: 'import', label: 'Sumber: import' },
		{ id: 'doi', label: 'Sumber: DOI' },
		{ id: 'manual', label: 'Sumber: manual' }
	] as const;

	let filters = $state<CitationListFilters>(EMPTY_CITATION_FILTERS);
	let searchDraft = $state('');
	let dialog = $state<DialogKind>(null);
	let deleteTarget = $state<CitationListItem | null>(null);
	let editTargetId = $state<string | null>(null);
	let selectionMode = $state(false);
	const selectedIds = new SvelteSet<string>();

	// Bulk bar local state (mode seleksi).
	let tagOpen = $state(false);
	let tagDraft = $state('');
	let confirmBulkDelete = $state(false);

	const list = useCitationsList(() => filters);
	const tags = useCitationTags();
	const createCitation = useCreateCitation();
	const deleteCitation = useDeleteCitation();
	const copyCitation = useCopyCitation(() => workspaceId);
	const bulkTag = useBulkTagCitations();
	const bulkDelete = useBulkDeleteCitations();
	const mergeMany = useMergeManyCitations();
	const editDetail = useCitationDetail(() => editTargetId);
	const updateCitation = useUpdateCitation();

	const items = $derived((list.data?.pages ?? []).flatMap((page) => page.items));
	const total = $derived(list.data?.pages[0]?.total ?? 0);
	const filtersActive = $derived(
		Boolean(filters.q) || filters.status !== null || filters.source !== null || filters.tag !== null
	);
	const showEmptyState = $derived(!list.isLoading && total === 0 && !filtersActive);
	const bulkIds = $derived([...selectedIds]);

	function applySearch(value: string) {
		searchDraft = value;
		filters = { ...filters, q: value.trim() };
	}

	function exitSelection() {
		selectionMode = false;
		selectedIds.clear();
		tagOpen = false;
		tagDraft = '';
		confirmBulkDelete = false;
	}

	function toggleSelect(id: string) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}

	function submitTag(event: SubmitEvent) {
		event.preventDefault();
		const value = tagDraft.trim();
		if (!value) return;
		bulkTag.mutate(
			{ ids: bulkIds, tags: [value] },
			{
				onSuccess: () => {
					tagOpen = false;
					tagDraft = '';
				}
			}
		);
	}
</script>

{#snippet toolbarTitle()}
	<PanelTitleLabel>
		{selectionMode ? `${selectedIds.size} dipilih` : 'Sitasi'}
	</PanelTitleLabel>
{/snippet}

{#snippet toolbarActions()}
	{#if selectionMode}
		<Button
			type="button"
			variant="ghost"
			class="h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={exitSelection}
		>
			Selesai
		</Button>
	{:else}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="ghost"
						class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Tambah referensi"
					>
						<Icon icon={PlusIcon} class="size-3.5" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={() => (dialog = 'import')}>
					<Icon icon={UploadIcon} class="size-3.5" />
					Import file (.bib/.ris)
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => (dialog = 'doi')}>
					<Icon icon={LinkIcon} class="size-3.5" />
					Dari DOI
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => (dialog = 'manual')}>
					<Icon icon={PenLineIcon} class="size-3.5" />
					Manual
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={() => (dialog = 'provider')}>
					<Icon icon={PlugIcon} class="size-3.5" />
					Tarik dari Mendeley/Zotero
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
		<CitationExportMenu disabled={total === 0} />
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="ghost"
						class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Opsi lain"
					>
						<Icon icon={MoreHorizontalIcon} class="size-3.5" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item disabled={total === 0} onSelect={() => (selectionMode = true)}>
					<Icon icon={CheckIcon} class="size-3.5" />
					Pilih beberapa
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => (dialog = 'duplicates')}>
					<Icon icon={LayersIcon} class="size-3.5" />
					Kelola duplikat
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={() => (dialog = 'settings')}>
					<Icon icon={SettingsIcon} class="size-3.5" />
					Gaya sitasi & urutan
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}

{#if citationId}
	<CitationDetailView {workspaceId} {citationId} onBack={onBackToList} {onAddToChat} />
{:else}
	<PanelCardToolbar
		title={toolbarTitle}
		eyebrow={!selectionMode && total > 0 ? `· ${total}` : undefined}
		actions={toolbarActions}
	/>

	<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
		{#if showEmptyState}
			<div class={cn('min-h-0 flex-1 overflow-y-auto', panelBodyPaddingClass)}>
				<CitationEmptyState
					onImportFile={() => (dialog = 'import')}
					onAddByDoi={() => (dialog = 'doi')}
					onAddManual={() => (dialog = 'manual')}
				/>
			</div>
		{:else}
			<div class="flex items-center gap-2 px-5 pb-2 pt-3 @2xl:px-6">
				<div class="relative min-w-0 flex-1">
					<Icon
						icon={SearchIcon}
						class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						value={searchDraft}
						oninput={(event) => applySearch((event.currentTarget as HTMLInputElement).value)}
						placeholder="Cari judul, penulis, DOI…"
						class="h-8 pl-8 text-[13px]"
					/>
				</div>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								class={cn(
									'size-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground',
									filtersActive && 'text-primary'
								)}
								aria-label="Filter referensi"
							>
								<Icon icon={FilterIcon} class="size-3.5" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-52">
						{#each STATUS_OPTIONS as status (status.id)}
							<DropdownMenu.Item
								onSelect={() =>
									(filters = {
										...filters,
										status: filters.status === status.id ? null : status.id
									})}
								class={cn(filters.status === status.id && 'text-primary')}
							>
								{status.label}
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
						{#each SOURCE_OPTIONS as source (source.id)}
							<DropdownMenu.Item
								onSelect={() =>
									(filters = {
										...filters,
										source: filters.source === source.id ? null : source.id
									})}
								class={cn(filters.source === source.id && 'text-primary')}
							>
								{source.label}
							</DropdownMenu.Item>
						{/each}
						{#if (tags.data ?? []).length > 0}
							<DropdownMenu.Separator />
							{#each (tags.data ?? []).slice(0, 12) as tag (tag)}
								<DropdownMenu.Item
									onSelect={() => (filters = { ...filters, tag: filters.tag === tag ? null : tag })}
									class={cn(filters.tag === tag && 'text-primary')}
								>
									Tag: {tag}
								</DropdownMenu.Item>
							{/each}
						{/if}
						{#if filtersActive}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => (filters = EMPTY_CITATION_FILTERS)}>
								Hapus semua filter
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			<div class={cn('min-h-0 flex-1 overflow-y-auto', panelBodyPaddingClass, 'pt-1')}>
				{#if list.isLoading}
					<p class="py-8 text-center text-[13px] font-medium text-muted-foreground">
						Memuat referensi…
					</p>
				{:else if items.length === 0}
					<p class="py-8 text-center text-[13px] font-medium text-muted-foreground">
						Tidak ada referensi yang cocok dengan filter.
					</p>
				{:else}
					<ul class="grid gap-1">
						{#each items as item (item.id)}
							{@const selected = selectedIds.has(item.id)}
							{@const externalHref = item.doi ? `https://doi.org/${item.doi}` : item.url}
							<li class="group relative">
								<button
									type="button"
									onclick={() => (selectionMode ? toggleSelect(item.id) : onOpenCitation(item.id))}
									aria-pressed={selectionMode ? selected : undefined}
									class={cn(
										'grid w-full gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/50 @3xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,0.5fr)_minmax(0,1fr)] @3xl:items-center @3xl:gap-3',
										selectionMode ? 'pr-2.5' : 'pr-16',
										selected && 'bg-muted/60'
									)}
								>
									<span class="flex min-w-0 items-center gap-1.5">
										{#if selectionMode}
											<span
												aria-hidden="true"
												class={cn(
													'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
													selected
														? 'border-primary bg-primary text-primary-foreground'
														: 'border-border bg-background'
												)}
											>
												{#if selected}<Icon icon={CheckIcon} class="size-3" />{/if}
											</span>
										{:else}
											<!-- Same size-4 footprint as the checkbox so entering selection mode doesn't shift titles. -->
											<span
												aria-hidden="true"
												title={CITATION_STATUS_LABELS[item.metadataStatus]}
												class="flex size-4 shrink-0 items-center justify-center"
											>
												<span
													class={cn(
														'size-1.5 rounded-full',
														item.metadataStatus === 'verified'
															? 'bg-mint'
															: item.metadataStatus === 'needs_review'
																? 'bg-amber-400'
																: 'bg-destructive/70'
													)}
												></span>
											</span>
										{/if}
										<span
											class="truncate text-[13px] font-semibold text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] @3xl:[-webkit-line-clamp:1]"
										>
											{item.title}
										</span>
									</span>
									<span class="truncate text-[12px] font-medium text-muted-foreground">
										{citationMetaLine(item)}
									</span>
									<span
										class="hidden truncate text-[11px] font-semibold text-muted-foreground @3xl:block"
									>
										{CITATION_SOURCE_LABELS[item.source]}
									</span>
									<span class="flex min-w-0 flex-wrap gap-1">
										{#each item.tags.slice(0, 2) as tag (tag)}
											<span
												class="truncate rounded-full bg-lavender-soft px-1.5 py-0.5 text-[10px] font-semibold text-lavender-foreground"
											>
												{tag}
											</span>
										{/each}
										{#if item.tags.length > 2}
											<span
												class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
											>
												+{item.tags.length - 2}
											</span>
										{/if}
									</span>
								</button>
								{#if !selectionMode}
									<span
										class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
									>
										<Button
											type="button"
											variant="ghost"
											class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label="Salin sitasi"
											onclick={() => copyCitation.mutate(item.id)}
										>
											<Icon icon={CopyIcon} class="size-3.5" />
										</Button>
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														type="button"
														variant="ghost"
														class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
														aria-label="Aksi referensi"
													>
														<Icon icon={MoreHorizontalIcon} class="size-3.5" />
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												<DropdownMenu.Item onSelect={() => onOpenCitation(item.id)}>
													Detail
												</DropdownMenu.Item>
												<DropdownMenu.Item onSelect={() => (editTargetId = item.id)}>
													<Icon icon={PencilIcon} class="size-3.5" />
													Edit
												</DropdownMenu.Item>
												{#if externalHref}
													<DropdownMenu.Item>
														{#snippet child({ props })}
															<a {...props} href={externalHref} target="_blank" rel="noreferrer">
																<Icon icon={ExternalLinkIcon} class="size-3.5" />
																Buka {item.doi ? 'DOI' : 'URL'}
															</a>
														{/snippet}
													</DropdownMenu.Item>
												{/if}
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													variant="destructive"
													onSelect={() => (deleteTarget = item)}
												>
													<Icon icon={Trash2Icon} class="size-3.5" />
													Hapus
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if list.hasNextPage}
					<div class="flex justify-center py-3">
						<Button
							type="button"
							variant="secondary"
							class="rounded-full px-4"
							disabled={list.isFetchingNextPage}
							onclick={() => void list.fetchNextPage()}
						>
							{list.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
						</Button>
					</div>
				{/if}
			</div>
		{/if}

		{#if selectionMode && selectedIds.size > 0}
			<div
				class="flex items-center gap-1 border-t border-border/70 bg-background/95 px-4 py-2 backdrop-blur @2xl:px-6"
			>
				<span class="mr-auto text-[12px] font-semibold text-muted-foreground">
					{bulkIds.length} dipilih
				</span>
				<Popover.Root open={tagOpen} onOpenChange={(open) => (tagOpen = open)}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="ghost"
								class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
								aria-label="Beri tag terpilih"
							>
								<Icon icon={BookmarkIcon} class="size-3.5" />
							</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content align="end" class="w-60">
						<form class="grid gap-2" onsubmit={submitTag}>
							<p class="text-[12px] font-semibold text-foreground">Beri tag</p>
							<Input
								value={tagDraft}
								oninput={(event) => (tagDraft = (event.currentTarget as HTMLInputElement).value)}
								placeholder="mis. bab-2"
								class="h-8 text-[13px]"
								{@attach (node) => node.focus()}
							/>
							<Button
								type="submit"
								variant="secondary"
								class="h-8 rounded-full"
								disabled={!tagDraft.trim() || bulkTag.isPending}
							>
								Tambah tag
							</Button>
						</form>
					</Popover.Content>
				</Popover.Root>
				<CitationExportMenu ids={bulkIds} />
				<Button
					type="button"
					variant="ghost"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
					aria-label="Gabungkan terpilih"
					disabled={bulkIds.length < 2 || mergeMany.isPending}
					onclick={() => mergeMany.mutate({ ids: bulkIds }, { onSuccess: exitSelection })}
				>
					<Icon icon={LayersIcon} class="size-3.5" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					class="size-7 shrink-0 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
					aria-label="Hapus terpilih"
					onclick={() => (confirmBulkDelete = true)}
				>
					<Icon icon={Trash2Icon} class="size-3.5" />
				</Button>
				<ConfirmDialog
					open={confirmBulkDelete}
					onOpenChange={(open) => (confirmBulkDelete = open)}
					title="Hapus referensi terpilih?"
					description={`${bulkIds.length} referensi dihapus dari library workspace ini.`}
					confirmLabel="Hapus"
					onConfirm={async () => {
						await bulkDelete.mutateAsync(bulkIds);
						confirmBulkDelete = false;
						exitSelection();
					}}
				/>
			</div>
		{/if}
	</div>

	<CitationImportWizard
		{workspaceId}
		open={dialog === 'import'}
		onOpenChange={(open) => (dialog = open ? 'import' : null)}
		onDone={() => (dialog = null)}
	/>
	<ProviderSyncWizard
		{workspaceId}
		open={dialog === 'provider'}
		onOpenChange={(open) => (dialog = open ? 'provider' : null)}
		onDone={() => (dialog = null)}
	/>
	<CitationDoiDialog
		open={dialog === 'doi'}
		onOpenChange={(open) => (dialog = open ? 'doi' : null)}
		onSubmit={(value) => createCitation.mutateAsync(value)}
	/>
	<CitationFormDialog
		open={dialog === 'manual'}
		citation={null}
		onOpenChange={(open) => (dialog = open ? 'manual' : null)}
		onSubmit={(value) => createCitation.mutateAsync({ fields: value.fields, tags: value.tags })}
	/>
	<CitationSettingsDialog
		{workspaceId}
		open={dialog === 'settings'}
		onOpenChange={(open) => (dialog = open ? 'settings' : null)}
	/>
	<CitationDuplicatesDialog
		{workspaceId}
		open={dialog === 'duplicates'}
		onOpenChange={(open) => (dialog = open ? 'duplicates' : null)}
	/>
	{#if editTargetId && editDetail.data}
		<CitationFormDialog
			open
			citation={editDetail.data}
			onOpenChange={(open) => {
				if (!open) editTargetId = null;
			}}
			onSubmit={(value) =>
				updateCitation.mutateAsync({
					citationId: editTargetId!,
					fields: value.fields,
					tags: value.tags
				})}
		/>
	{/if}
	<ConfirmDialog
		open={deleteTarget !== null}
		onOpenChange={(open) => {
			if (!open) deleteTarget = null;
		}}
		title="Hapus referensi?"
		description={deleteTarget ? `"${deleteTarget.title}" dihapus dari library workspace ini.` : ''}
		confirmLabel="Hapus"
		onConfirm={async () => {
			if (!deleteTarget) return;
			await deleteCitation.mutateAsync(deleteTarget.id);
			deleteTarget = null;
		}}
	/>
{/if}
