<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { cn } from '@aqsha/ui-svelte/utils';
	import LibraryCardFrame from '$lib/components/LibraryCardFrame.svelte';
	import LibraryCardContextMenu from './LibraryCardContextMenu.svelte';
	import {
		Icon,
		AlertCircleIcon,
		CheckCircle2Icon,
		CircleIcon,
		CopyIcon,
		ExternalLinkIcon,
		FileTextIcon,
		MoreHorizontalIcon,
		type IconSvgElement
	} from '$lib/icons';
	import { ingestBadge } from '../../library-ingest-view';
	import {
		CITATION_STATUS_LABELS,
		formatCitationAuthor,
		type CitationListItem
	} from '../../types';

	/**
	 * Kartu perpustakaan — index card berwarna (tahun + kategori, judul, penulis, status).
	 * `membershipAction` disuplai pemanggil (tambah ke proyek / lepas dari proyek).
	 */
	let {
		item,
		selectionMode,
		selected,
		onToggleSelect,
		onOpen,
		onCopy,
		membershipAction,
		onEdit,
		onDelete,
		readerHref = null,
		onSelectMany
	}: {
		item: CitationListItem;
		selectionMode: boolean;
		selected: boolean;
		onToggleSelect: () => void;
		onOpen: () => void;
		onCopy: () => void;
		membershipAction: { label: string; icon: IconSvgElement; run: () => void };
		onEdit: () => void;
		onDelete: () => void;
		/** Null bila item belum punya paper untuk dibuka di reader. */
		readerHref?: string | null;
		onSelectMany: () => void;
	} = $props();

	/** Muted index-card faces — physical study cards on the desk, not paper tiles. */
	const CARD_TONES = [
		'bg-[oklch(0.42_0.048_145)] border-[oklch(0.34_0.04_145)]',
		'bg-[oklch(0.38_0.055_305)] border-[oklch(0.3_0.05_305)]',
		'bg-[oklch(0.36_0.012_70)] border-[oklch(0.28_0.01_70)]',
		'bg-[oklch(0.4_0.04_55)] border-[oklch(0.32_0.035_55)]',
		'bg-[oklch(0.4_0.035_210)] border-[oklch(0.32_0.03_210)]',
		'bg-[oklch(0.39_0.045_25)] border-[oklch(0.31_0.04_25)]'
	] as const;

	const STATUS_ICON: Record<
		CitationListItem['metadataStatus'],
		{ icon: IconSvgElement; class: string }
	> = {
		verified: { icon: CheckCircle2Icon, class: 'text-[oklch(0.82_0.1_154)]' },
		needs_review: { icon: AlertCircleIcon, class: 'text-[oklch(0.86_0.1_90)]' },
		incomplete: { icon: CircleIcon, class: 'text-white/45' }
	};

	const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

	const tone = $derived(CARD_TONES[toneIndex(item.id)] ?? CARD_TONES[0]);
	const isNew = $derived(Date.now() - item.updatedAt < NEW_WINDOW_MS);
	const yearLabel = $derived(item.publishedYear?.toString() ?? '—');
	const category = $derived(item.tags[0] ?? null);
	const authorsLine = $derived(formatAuthorsLine(item.authors));
	const status = $derived(STATUS_ICON[item.metadataStatus]);
	const externalHref = $derived(item.doi ? `https://doi.org/${item.doi}` : (item.url ?? null));
	const badge = $derived(ingestBadge(item));
	const badgeClass: Record<'muted' | 'progress' | 'danger', string> = {
		muted: 'bg-white/15 text-white/75',
		progress: 'bg-white/25 text-white animate-pulse',
		danger: 'bg-destructive/25 text-white'
	};

	function toneIndex(id: string): number {
		let hash = 0;
		for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
		return hash % CARD_TONES.length;
	}

	function formatAuthorsLine(authors: CitationListItem['authors']): string {
		if (authors.length === 0) return 'Tanpa penulis';
		return authors.map(formatCitationAuthor).filter(Boolean).join(', ');
	}
</script>

<li class="min-w-0 list-none">
	<LibraryCardContextMenu
		title={item.title}
		{externalHref}
		{readerHref}
		{membershipAction}
		onOpenDetail={onOpen}
		{onEdit}
		{onCopy}
		{onSelectMany}
		{onDelete}
	>
		<LibraryCardFrame
			selected={selected}
			contentClassName={cn(tone, 'text-white shadow-none')}
			class="aspect-[7/9] h-full min-h-[270px] @lg:min-h-[330px]"
		>
			<div class="relative flex size-full min-h-0 flex-col">
				{#if selectionMode}
					<div class="absolute top-3.5 left-3.5 z-10">
						<Checkbox
							checked={selected}
							onCheckedChange={onToggleSelect}
							aria-label={`Pilih ${item.title}`}
							class="border-white/50 bg-white/10 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-[oklch(0.28_0.02_70)]"
						/>
					</div>
				{/if}

				<div
					class="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
				>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="ghost"
									size="icon"
									class="size-7 text-white/75 hover:bg-white/15 hover:text-white"
									aria-label={`Aksi ${item.title}`}
								>
									<Icon icon={MoreHorizontalIcon} class="size-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={onOpen}>Lihat detail</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={onEdit}>Edit</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={onCopy}>
								<Icon icon={CopyIcon} class="size-4" /> Salin sitasi
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={membershipAction.run}>
								<Icon icon={membershipAction.icon} class="size-4" />
								{membershipAction.label}
							</DropdownMenu.Item>
							{#if externalHref}
								<DropdownMenu.Item
									onSelect={() => window.open(externalHref, '_blank', 'noopener')}
								>
									<Icon icon={ExternalLinkIcon} class="size-4" /> Buka sumber
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onSelect={onDelete}>Hapus</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>

				<button
					type="button"
					class="flex size-full min-h-0 flex-col p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
					onclick={onOpen}
				>
					<div
						class={cn(
							'flex min-w-0 shrink-0 flex-nowrap items-center gap-x-2 gap-y-1.5 pr-10',
							selectionMode && 'pl-8'
						)}
					>
						{#if isNew}
							<span
								class="inline-flex h-5 shrink-0 items-center rounded-full bg-white/90 px-2 text-[10px] font-bold tracking-wide text-[oklch(0.28_0.02_70)]"
							>
								Baru
							</span>
						{/if}
						<span class="shrink-0 text-[12px] font-medium tabular-nums text-white/70">{yearLabel}</span>
						{#if category}
							<span aria-hidden="true" class="shrink-0 text-white/35">·</span>
							<span
								class="min-w-0 truncate text-[12px] font-medium text-white/70"
								title={category}
							>
								{category}
							</span>
						{/if}
					</div>

					<!-- shrink-0 keeps line-clamp from being flex-squashed into a half-line clip -->
					<h3
						class="mt-5 min-w-0 shrink-0 line-clamp-4 text-[18px] font-semibold leading-snug text-white @lg:text-[20px]"
						title={item.title}
					>
						{item.title}
					</h3>

					<p
						class="mt-3 min-w-0 shrink-0 line-clamp-2 text-[13px] leading-snug text-white/65"
						title={authorsLine}
					>
						{authorsLine}
					</p>

					<div class="mt-auto flex shrink-0 items-center gap-2 pt-8">
						<span class="inline-flex min-w-0 items-center gap-1.5 text-white/70">
							<Icon icon={FileTextIcon} class="size-3.5 shrink-0" />
							<span class="text-[12px] font-semibold tabular-nums leading-none">
								{item.tags.length}
							</span>
						</span>

						{#if badge}
							<span
								class={cn(
									'ml-auto inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
									badgeClass[badge.tone]
								)}
							>
								{badge.label}
							</span>
						{/if}
						<span
							class={cn('inline-flex size-4 shrink-0', !badge && 'ml-auto', status.class)}
							title={CITATION_STATUS_LABELS[item.metadataStatus]}
							aria-label={`Status metadata: ${CITATION_STATUS_LABELS[item.metadataStatus]}`}
						>
							<Icon icon={status.icon} class="size-4" />
						</span>
					</div>
				</button>
			</div>
		</LibraryCardFrame>
	</LibraryCardContextMenu>
</li>
