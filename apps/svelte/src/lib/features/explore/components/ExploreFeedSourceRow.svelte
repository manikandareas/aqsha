<script module lang="ts">
	import type { DiscoveryItem as DiscoveryItemModel } from '$lib/features/discovery/model';

	export type ExploreFeedSourceRowHandlers = {
		onSaved: (item: DiscoveryItemModel) => void;
		onHide: (item: DiscoveryItemModel) => void;
	};
</script>

<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import {
		Icon,
		ExternalLinkIcon,
		FileDownIcon,
		MoreHorizontalIcon,
		ThumbsDownIcon
	} from '$lib/icons';
	import { buildSourceLine, formatCitationCount } from '$lib/features/discovery/format';
	import { feedDetailHref, type DiscoveryItem } from '$lib/features/discovery/model';
	import SaveSourceButton from '$lib/features/discovery/components/SaveSourceButton.svelte';

	let { item, handlers }: { item: DiscoveryItem; handlers: ExploreFeedSourceRowHandlers } =
		$props();

	const detailHref = $derived(feedDetailHref(item));
	const destination = $derived(detailHref ?? item.resolvedUrl ?? item.url);
	const isExternal = $derived(detailHref === null);
	const sourceLine = $derived(buildSourceLine(item));
	const citationLabel = $derived(formatCitationCount(item.citedByCount));
	const summary = $derived(item.tldr ?? item.summary);
</script>

<article
	class="group px-4 py-5 transition-colors hover:bg-muted/55 focus-within:bg-muted/55 sm:px-5"
>
	<div class="flex min-w-0 items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<div class="mb-2 flex flex-wrap items-center gap-1.5">
				{#if item.isOpenAccess}<Badge variant="chip-mint">Open access</Badge>{/if}
				{#each item.topics.slice(0, 2) as topic (topic)}<Badge variant="outline">{topic}</Badge
					>{/each}
			</div>
			<h3 class="text-[15px] leading-5 font-semibold text-foreground sm:text-base">
				<a
					href={destination}
					target={isExternal ? '_blank' : undefined}
					rel={isExternal ? 'noreferrer' : undefined}
					class="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>{item.title}</a
				>
			</h3>
			<p class="mt-2 text-label text-muted-foreground">{sourceLine}</p>
			{#if summary}<p class="mt-2 line-clamp-3 max-w-[75ch] text-[13px] leading-5 text-ink-soft">
					{summary}
				</p>{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<SaveSourceButton
				source={{
					title: item.title,
					doi: item.doi ?? null,
					url: item.url ?? null,
					authors: item.authors ?? [],
					year: item.year ?? null,
					venue: item.venue ?? null
				}}
				label=""
				size="icon"
				variant="ghost"
				ariaLabel="Simpan ke perpustakaan"
				class="size-8 rounded-md text-muted-foreground hover:text-foreground"
				onSaved={() => handlers.onSaved(item)}
			/>
			{@render overflowMenu()}
		</div>
	</div>
	<div class="mt-3 border-t border-border/70 pt-3 text-label text-muted-foreground">
		{#if citationLabel}<span class="tabular-nums">{citationLabel}</span>{/if}
	</div>
</article>

{#snippet overflowMenu()}
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
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={item.url} target="_blank" rel="noreferrer">
						<Icon icon={ExternalLinkIcon} />Buka sumber
					</a>
				{/snippet}
			</DropdownMenu.Item>
			{#if item.pdfUrl}
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={item.pdfUrl} target="_blank" rel="noreferrer">
							<Icon icon={FileDownIcon} />Unduh PDF
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				class="text-destructive focus:text-destructive"
				onSelect={() => handlers.onHide(item)}
			>
				<Icon icon={ThumbsDownIcon} />Tidak relevan
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}
