<script lang="ts">
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button';
	import {
		ArrowLeftIcon,
		BookOpenIcon,
		CheckCircle2Icon,
		CopyIcon,
		ExternalLinkIcon,
		Icon,
		MessageSquarePlusIcon,
		MoreHorizontalIcon,
		PencilIcon,
		RotateCcwIcon,
		Trash2Icon
	} from '$lib/icons';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '$lib/utils';
	import {
		useCitationDetail,
		useCitationRender,
		useCopyCitation,
		useDeleteCitation,
		useResolveCitation,
		useUpdateCitation
	} from '../api';
	import { CITATION_SOURCE_LABELS, CITATION_STATUS_LABELS, formatCitationAuthor } from '../types';
	import CitationFormDialog from './CitationFormDialog.svelte';

	/**
	 * Sub-view detail sitasi (`?panel=cite:<id>`): metadata lengkap + preview terformat
	 * style default + provenance + status quality. Citation soft-deleted tetap terbuka
	 * dengan badge `dihapus` (missing-state — tidak pernah hilang diam-diam).
	 */
	let {
		workspaceId,
		citationId,
		onBack,
		onAddToChat
	}: {
		workspaceId: string;
		citationId: string;
		onBack: () => void;
		/** Fase 4 — sematkan referensi ini sebagai konteks chip di composer chat Astra. */
		onAddToChat?: (citation: { id: string; title: string }) => void;
	} = $props();

	const detail = useCitationDetail(
		() => workspaceId,
		() => citationId
	);
	const render = useCitationRender(
		() => workspaceId,
		() => ({ styleId: null, ids: [citationId] })
	);
	const copyCitation = useCopyCitation(() => workspaceId);
	const updateCitation = useUpdateCitation(() => workspaceId);
	const deleteCitation = useDeleteCitation(() => workspaceId);
	const resolveCitation = useResolveCitation(() => workspaceId);
	let editOpen = $state(false);
	let confirmDelete = $state(false);

	const citation = $derived(detail.data);
</script>

{#snippet titleLabel()}
	<button
		type="button"
		onclick={onBack}
		class="flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
	>
		<Icon icon={ArrowLeftIcon} class="size-3.5 shrink-0" />
		Sitasi
	</button>
{/snippet}

{#snippet detailActions()}
	{#if citation && !citation.deletedAt}
		<Button
			type="button"
			variant="ghost"
			class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			aria-label="Salin sitasi"
			onclick={() => copyCitation.mutate(citation.id)}
		>
			<Icon icon={CopyIcon} class="size-3.5" />
		</Button>
		<Button
			type="button"
			variant="ghost"
			class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			aria-label="Edit referensi"
			onclick={() => (editOpen = true)}
		>
			<Icon icon={PencilIcon} class="size-3.5" />
		</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="ghost"
						class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Aksi lain"
					>
						<Icon icon={MoreHorizontalIcon} class="size-3.5" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#if onAddToChat}
					<DropdownMenu.Item
						onSelect={() => onAddToChat?.({ id: citation.id, title: citation.title })}
					>
						<Icon icon={MessageSquarePlusIcon} class="size-3.5" />
						Tambahkan ke chat
					</DropdownMenu.Item>
				{/if}
				{#if citation.doi || citation.url}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								{...props}
								href={citation.doi ? `https://doi.org/${citation.doi}` : (citation.url ?? '#')}
								target="_blank"
								rel="noreferrer"
							>
								<Icon icon={ExternalLinkIcon} class="size-3.5" />
								Buka {citation.doi ? 'DOI' : 'URL'}
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
				{#if citation.doi && citation.metadataStatus !== 'verified'}
					<DropdownMenu.Item
						disabled={resolveCitation.isPending}
						onSelect={() => resolveCitation.mutate(citation.id)}
					>
						<Icon icon={RotateCcwIcon} class="size-3.5" />
						Perbarui dari DOI
					</DropdownMenu.Item>
				{/if}
				{#if citation.metadataStatus !== 'verified'}
					<DropdownMenu.Item
						onSelect={() => updateCitation.mutate({ citationId: citation.id, markReviewed: true })}
					>
						<Icon icon={CheckCircle2Icon} class="size-3.5" />
						Tandai sudah direview
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item variant="destructive" onSelect={() => (confirmDelete = true)}>
					<Icon icon={Trash2Icon} class="size-3.5" />
					Hapus
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}

<PanelCardToolbar
	title={titleLabel}
	actions={citation && !citation.deletedAt ? detailActions : undefined}
/>
<div class={cn('min-h-0 flex-1 overflow-y-auto', panelBodyPaddingClass)}>
	{#if detail.isLoading}
		<p class="py-8 text-center text-[13px] font-medium text-muted-foreground">Memuat referensi…</p>
	{:else if !citation}
		<p class="py-8 text-center text-[13px] font-medium text-muted-foreground">
			Referensi tidak ditemukan.
		</p>
	{:else}
		<div class="grid gap-5 pb-4">
			<div class="grid gap-1.5">
				<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
					<span class="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
						{citation.documentType}
					</span>
					<span class="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
						{CITATION_SOURCE_LABELS[citation.source]}
					</span>
					<span
						class={cn(
							'rounded-full px-2 py-0.5',
							citation.metadataStatus === 'verified'
								? 'bg-mint-soft text-mint-foreground'
								: 'bg-amber-100 text-amber-700'
						)}
					>
						{CITATION_STATUS_LABELS[citation.metadataStatus]}
					</span>
					{#if citation.deletedAt}
						<span class="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">dihapus</span>
					{/if}
				</div>
				<h2 class="text-[15px] font-semibold leading-snug text-foreground">{citation.title}</h2>
			</div>

			{#if render.data?.entries[0]?.text}
				<blockquote
					class="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-foreground"
				>
					{render.data.entries[0].text}
				</blockquote>
			{/if}

			<dl class="grid gap-2.5 text-[13px]">
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Penulis</dt>
					<dd class="min-w-0 font-medium text-foreground">
						{citation.authors.length > 0
							? citation.authors.map(formatCitationAuthor).join('; ')
							: '—'}
					</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Tahun</dt>
					<dd class="min-w-0 font-medium text-foreground">{citation.publishedYear ?? '—'}</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Venue</dt>
					<dd class="min-w-0 font-medium text-foreground">{citation.venue ?? '—'}</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Penerbit</dt>
					<dd class="min-w-0 font-medium text-foreground">{citation.publisher ?? '—'}</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">DOI</dt>
					<dd class="min-w-0 font-medium text-foreground">
						{#if citation.doi}
							<a
								class="text-primary underline-offset-2 hover:underline"
								href={`https://doi.org/${citation.doi}`}
								target="_blank"
								rel="noreferrer"
							>
								{citation.doi}
							</a>
						{:else}
							—
						{/if}
					</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">URL</dt>
					<dd class="min-w-0 font-medium text-foreground">
						{#if citation.url}
							<a
								class="break-all text-primary underline-offset-2 hover:underline"
								href={citation.url}
								target="_blank"
								rel="noreferrer"
							>
								{citation.url}
							</a>
						{:else}
							—
						{/if}
					</dd>
				</div>
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Tag</dt>
					<dd class="min-w-0 font-medium text-foreground">
						{citation.tags.length > 0 ? citation.tags.join(', ') : '—'}
					</dd>
				</div>
				{#if citation.artifactId}
					<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
						<dt class="text-[12px] font-semibold text-muted-foreground">Artifact</dt>
						<dd class="min-w-0 font-medium text-foreground">
							<span class="flex flex-wrap items-center gap-2">
								<a
									href={`/app/workspaces/${workspaceId}/artifacts/${citation.artifactId}`}
									class="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
								>
									<Icon icon={BookOpenIcon} class="size-3.5" />
									Buka di reader
								</a>
								{#if !citation.deletedAt}
									<button
										type="button"
										onclick={() =>
											updateCitation.mutate({ citationId: citation.id, artifactId: null })}
										class="text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive"
									>
										Lepas tautan
									</button>
								{/if}
							</span>
						</dd>
					</div>
				{/if}
				<div class="grid grid-cols-[6rem_1fr] items-baseline gap-2">
					<dt class="text-[12px] font-semibold text-muted-foreground">Ditambahkan</dt>
					<dd class="min-w-0 font-medium text-foreground">
						{new Date(citation.createdAt).toLocaleDateString('id-ID', {
							day: 'numeric',
							month: 'long',
							year: 'numeric'
						})}
					</dd>
				</div>
			</dl>
		</div>
	{/if}
</div>

{#if citation}
	<CitationFormDialog
		open={editOpen}
		{citation}
		onOpenChange={(open) => (editOpen = open)}
		onSubmit={(value) =>
			updateCitation.mutateAsync({
				citationId: citation.id,
				fields: value.fields,
				tags: value.tags
			})}
	/>
{/if}
<ConfirmDialog
	open={confirmDelete}
	onOpenChange={(open) => (confirmDelete = open)}
	title="Hapus referensi?"
	description="Referensi dihapus dari library workspace ini. Dokumen yang memakainya akan menandainya sebagai hilang."
	confirmLabel="Hapus"
	onConfirm={async () => {
		if (!citation) return;
		await deleteCitation.mutateAsync(citation.id);
		onBack();
	}}
/>
