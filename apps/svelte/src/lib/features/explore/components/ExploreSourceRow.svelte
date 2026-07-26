<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import {
		Icon,
		AlertCircleIcon,
		ExternalLinkIcon,
		FileDownIcon,
		MoreHorizontalIcon,
		ThumbsDownIcon
	} from '$lib/icons';
	import { formatCitationCount } from '$lib/features/discovery/format';
	import type { ExploreSource } from '../explore-source';
	import SaveSourceButton from '$lib/features/discovery/components/SaveSourceButton.svelte';
	import type { SourceSaveInput } from '$lib/features/discovery/source-save';

	let {
		source,
		selected = false,
		onSelectedChange,
		onSaved,
		onHide
	}: {
		source: ExploreSource;
		selected?: boolean;
		onSelectedChange: (selected: boolean) => void;
		onSaved?: () => void;
		onHide?: () => void;
	} = $props();

	const sourceLine = $derived(
		[
			source.authors.length > 0
				? source.authors.slice(0, 4).join(', ') + (source.authors.length > 4 ? ' dkk.' : '')
				: null,
			source.year,
			source.venue
		]
			.filter(Boolean)
			.join(' · ')
	);
	const citationLabel = $derived(formatCitationCount(source.citedByCount ?? undefined));
	const saveInput = $derived<SourceSaveInput>({
		title: source.title,
		doi: source.doi,
		url: source.url,
		authors: source.authors,
		year: source.year,
		venue: source.venue
	});

	function handleCheckedChange(checked: boolean | 'indeterminate'): void {
		onSelectedChange(checked === true);
	}
</script>

<article class="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-1 pb-5 sm:gap-x-4 sm:px-1.5">
	<Checkbox
		checked={selected}
		onCheckedChange={handleCheckedChange}
		aria-label={`Pilih ${source.title}`}
		class="mt-1 size-5 shrink-0"
	/>

	<div class="min-w-0">
		<div class="flex min-w-0 items-start justify-between gap-2 sm:gap-4">
			<div class="min-w-0 flex-1">
				<div class="mb-2 flex flex-wrap items-center gap-1.5">
					{#if source.isOpenAccess}<Badge variant="chip-mint">Open access</Badge>{/if}
					<!-- Badges never wrap internally, so a long topic must truncate or it overflows the row. -->
					{#each source.topics.slice(0, 2) as topic (topic)}
						<Badge variant="outline" class="max-w-full"
							><span class="min-w-0 truncate">{topic}</span></Badge
						>
					{/each}
					{#if source.isRetracted}
						<span
							class="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-2 py-1 text-label font-semibold text-destructive"
							><Icon icon={AlertCircleIcon} class="size-3" />Paper ditarik</span
						>
					{/if}
				</div>
				<h3 class="text-[15px] leading-5 font-semibold break-words text-foreground sm:text-base">
					<a
						href={source.href}
						target={source.external ? '_blank' : undefined}
						rel={source.external ? 'noreferrer' : undefined}
						class="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>{source.title}</a
					>
				</h3>
				{#if sourceLine}<p class="mt-2 text-label text-muted-foreground">{sourceLine}</p>{/if}
				{#if source.summary}
					<p class="mt-2 line-clamp-3 max-w-[75ch] text-[13px] leading-5 text-ink-soft">
						{source.summary}
					</p>
				{/if}
			</div>

			<div
				role="group"
				aria-label={`Tindakan untuk ${source.title}`}
				class="flex shrink-0 items-center gap-1"
			>
				<SaveSourceButton
					source={saveInput}
					label=""
					variant="ghost"
					size="icon"
					ariaLabel="Simpan ke perpustakaan"
					class="size-8 rounded-md text-muted-foreground hover:text-foreground"
					{onSaved}
				/>
				{@render overflowMenu()}
			</div>
		</div>

		<div
			class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-label text-muted-foreground"
		>
			{#if citationLabel}<span class="tabular-nums">{citationLabel}</span>{/if}
			{#if source.hasPdf}
				<span class="inline-flex items-center gap-1"
					><Icon icon={FileDownIcon} class="size-3" />PDF tersedia</span
				>
			{/if}
		</div>
	</div>
</article>

{#snippet overflowMenu()}
	{#if source.url || source.pdfUrl || onHide}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						aria-label="Tindakan lain"
						class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<Icon icon={MoreHorizontalIcon} class="size-[18px]" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				{#if source.url}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={source.url} target="_blank" rel="noreferrer">
								<Icon icon={ExternalLinkIcon} />Buka sumber
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
				{#if source.pdfUrl}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={source.pdfUrl} target="_blank" rel="noreferrer">
								<Icon icon={FileDownIcon} />Unduh PDF
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
				{#if onHide}
					{#if source.url || source.pdfUrl}<DropdownMenu.Separator />{/if}
					<DropdownMenu.Item
						class="text-destructive focus:text-destructive"
						onSelect={() => onHide?.()}
					>
						<Icon icon={ThumbsDownIcon} />Tidak relevan
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}
