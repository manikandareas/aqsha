<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { cn } from '@aqsha/ui-svelte/utils';
	import {
		Icon,
		CopyIcon,
		ExternalLinkIcon,
		MoreHorizontalIcon,
		type IconSvgElement
	} from '$lib/icons';
	import {
		CITATION_SOURCE_LABELS,
		CITATION_STATUS_LABELS,
		citationMetaLine,
		type CitationListItem
	} from '../../types';

	/**
	 * Baris perpustakaan lebar penuh: status → judul → meta → source → tag → aksi hover.
	 * `membershipAction` adalah aksi keanggotaan proyek eksplisit (tambahkan ke proyek di
	 * scope global, lepas dari proyek di scope proyek) — baris ini tidak menyimpulkan scope
	 * dari URL, pemanggil yang menentukan label/ikon/aksi.
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
		onDelete
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
	} = $props();

	const STATUS_DOT: Record<CitationListItem['metadataStatus'], string> = {
		verified: 'bg-mint',
		needs_review: 'bg-lemon',
		incomplete: 'bg-muted-foreground/40'
	};

	const externalHref = $derived(item.doi ? `https://doi.org/${item.doi}` : (item.url ?? null));
</script>

<li
	class={cn(
		'group flex items-center gap-3 rounded-md border-2 border-border bg-card px-4 py-3',
		selected && 'border-ring'
	)}
>
	{#if selectionMode}
		<Checkbox
			checked={selected}
			onCheckedChange={onToggleSelect}
			aria-label={`Pilih ${item.title}`}
		/>
	{:else}
		<span
			aria-hidden="true"
			class={`size-2 shrink-0 rounded-full ${STATUS_DOT[item.metadataStatus]}`}
			title={CITATION_STATUS_LABELS[item.metadataStatus]}
		></span>
	{/if}
	<button type="button" class="min-w-0 flex-1 text-left" onclick={onOpen}>
		<p class="truncate text-sm font-medium leading-snug group-hover:underline">{item.title}</p>
		<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
	</button>
	<Badge variant="outline" class="hidden shrink-0 sm:inline-flex">
		{CITATION_SOURCE_LABELS[item.source]}
	</Badge>
	{#if item.tags.length > 0}
		<span class="hidden max-w-40 truncate text-label text-muted-foreground lg:inline">
			{item.tags.join(' · ')}
		</span>
	{/if}
	<div
		class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
	>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-7"
			aria-label="Salin sitasi"
			onclick={onCopy}
		>
			<Icon icon={CopyIcon} class="size-3.5" />
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-7"
			aria-label={membershipAction.label}
			onclick={membershipAction.run}
		>
			<Icon icon={membershipAction.icon} class="size-3.5" />
		</Button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="ghost"
						size="icon"
						class="size-7"
						aria-label={`Aksi ${item.title}`}
					>
						<Icon icon={MoreHorizontalIcon} class="size-4" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onSelect={onOpen}>Lihat detail</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={onEdit}>Edit</DropdownMenu.Item>
				{#if externalHref}
					<DropdownMenu.Item onSelect={() => window.open(externalHref, '_blank', 'noopener')}>
						<Icon icon={ExternalLinkIcon} class="size-4" /> Buka sumber
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={onDelete}>Hapus</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</li>
