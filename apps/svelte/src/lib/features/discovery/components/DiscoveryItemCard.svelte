<script module lang="ts">
	import type { DiscoveryItem } from '../model';

	export type DiscoveryCardHandlers = {
		onSaved: (item: DiscoveryItem) => void;
		onHide: (item: DiscoveryItem) => void;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import {
		Icon,
		AlertCircleIcon,
		ExternalLinkIcon,
		FileDownIcon,
		MoreHorizontalIcon,
		ThumbsDownIcon
	} from '$lib/icons';
	import { firstInitial } from '$lib/components/generative-cover';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { feedDetailHref } from '../model';
	import { domainFromUrl, formatCitationCount, relativeTime, sourceName } from '../format';
	import CardMedia from './CardMedia.svelte';
	import SaveSourceButton from './SaveSourceButton.svelte';

	/**
	 * Editorial discovery card — hero, feature (+ imageSide), and standard variants. `handlers` =
	 * saved (interest) / hide (record & remove).
	 */
	let {
		item,
		handlers,
		variant,
		imageSide = 'right'
	}: {
		item: DiscoveryItem;
		handlers: DiscoveryCardHandlers;
		variant: 'hero' | 'feature' | 'standard';
		imageSide?: 'left' | 'right';
	} = $props();

	const isSpotlight = $derived(variant !== 'standard');
	const size = $derived<'hero' | 'feature'>(variant === 'hero' ? 'hero' : 'feature');
	const title = $derived(item.title);
	const tldr = $derived(item.tldr ?? item.summary);

	// Internal reader href (null → external only). SvelteKit intercepts same-origin `<a>`.
	const detailHref = $derived(feedDetailHref(item));

	const titleClass = $derived(
		size === 'hero'
			? 'text-[25px] leading-[1.1] @2xl:text-[31px]'
			: 'text-[21px] leading-[1.14] @2xl:text-[25px]'
	);
	const mediaHeight = $derived(
		size === 'hero'
			? 'h-52 @2xl:h-64 @xl/feed:h-full @xl/feed:min-h-[300px]'
			: 'h-48 @2xl:h-56 @xl/feed:h-full @xl/feed:min-h-[224px]'
	);
	const columns = $derived(
		imageSide === 'left'
			? '@xl/feed:grid-cols-[minmax(260px,40%)_minmax(0,1fr)]'
			: '@xl/feed:grid-cols-[minmax(0,1fr)_minmax(260px,40%)]'
	);

	const citation = $derived(item.kind === 'paper' ? formatCitationCount(item.citedByCount) : null);
	const sourceTime = $derived(
		relativeTime(item.publishedAt) ?? (item.year ? String(item.year) : null)
	);
	const avatarDomain = $derived(item.kind === 'news' ? domainFromUrl(item.url) : null);
</script>

{#snippet cardLink(cls: string, decorative: boolean, content: Snippet)}
	{#if detailHref}
		<a
			href={detailHref}
			class={cn('focus:outline-none focus-visible:underline', cls)}
			aria-hidden={decorative || undefined}
			tabindex={decorative ? -1 : undefined}
		>
			{@render content()}
		</a>
	{:else}
		<a
			href={item.url}
			target="_blank"
			rel="noreferrer"
			class={cn('focus:outline-none focus-visible:underline', cls)}
			aria-hidden={decorative || undefined}
			tabindex={decorative ? -1 : undefined}
		>
			{@render content()}
		</a>
	{/if}
{/snippet}

{#snippet retractionFlag()}
	{#if item.retractionStatus === 'retracted'}
		<p
			class="mt-2 inline-flex w-fit items-center gap-1 rounded-[5px] border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
		>
			<Icon icon={AlertCircleIcon} class="size-3" /> Paper ditarik (retracted)
		</p>
	{:else if item.retractionStatus === 'concern'}
		<p
			class="mt-2 inline-flex w-fit items-center gap-1 rounded-[5px] border border-coral-soft-border bg-coral-soft px-2 py-0.5 text-[11px] font-semibold text-coral-foreground"
		>
			<Icon icon={AlertCircleIcon} class="size-3" /> Ada catatan kekhawatiran
		</p>
	{/if}
{/snippet}

{#snippet sourceRow()}
	<div class="flex min-w-0 items-center gap-2">
		<span
			class={cn(
				'relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold leading-none',
				item.kind === 'paper'
					? 'bg-mint-soft text-mint-foreground'
					: 'bg-lemon-soft text-lemon-foreground'
			)}
		>
			<span aria-hidden="true">{firstInitial(sourceName(item))}</span>
			{#if avatarDomain}
				<span
					aria-hidden="true"
					class="absolute inset-0 rounded-full bg-card bg-cover bg-center"
					style="background-image: url('https://www.google.com/s2/favicons?domain={avatarDomain}&sz=64')"
				></span>
			{/if}
		</span>
		<p class="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
			<span class="font-semibold text-foreground/85">{sourceName(item)}</span>
			{#if sourceTime}<span> · {sourceTime}</span>{/if}
			{#if citation}<span> · {citation}</span>{/if}
		</p>
	</div>
{/snippet}

{#snippet overflowMenu()}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					aria-label="Tindakan lain"
					class="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
				>
					<Icon icon={MoreHorizontalIcon} class="size-[18px]" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-52">
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={item.url} target="_blank" rel="noreferrer">
						<Icon icon={ExternalLinkIcon} /> Buka sumber
					</a>
				{/snippet}
			</DropdownMenu.Item>
			{#if item.kind === 'paper' && item.pdfUrl}
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={item.pdfUrl} target="_blank" rel="noreferrer">
							<Icon icon={FileDownIcon} /> Unduh PDF
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/if}

			<DropdownMenu.Separator />

			<DropdownMenu.Item
				class="text-destructive focus:text-destructive"
				onSelect={() => handlers.onHide(item)}
			>
				<Icon icon={ThumbsDownIcon} /> Tidak relevan
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#snippet cardFooter()}
	<div class="flex items-center justify-between gap-3">
		{@render sourceRow()}
		<div class="-mr-1 flex shrink-0 items-center gap-0.5">
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
				class="size-8 rounded-full text-muted-foreground hover:text-foreground"
				onSaved={() => handlers.onSaved(item)}
			/>
			{@render overflowMenu()}
		</div>
	</div>
{/snippet}

{#snippet mediaContent(cls: string)}
	<CardMedia {item} {title} class={cls} />
{/snippet}

{#if isSpotlight}
	<article class="group">
		<div class={cn('grid gap-5 @xl/feed:items-stretch @xl/feed:gap-7', columns)}>
			{@render cardLink(
				cn('order-1 block', imageSide === 'left' ? '@xl/feed:order-1' : '@xl/feed:order-2'),
				true,
				spotlightMedia
			)}

			<div
				class={cn(
					'order-2 flex min-w-0 flex-col justify-center',
					imageSide === 'left' ? '@xl/feed:order-2' : '@xl/feed:order-1'
				)}
			>
				<h2 class={cn('font-heading font-bold tracking-tight text-foreground', titleClass)}>
					{@render cardLink('hover:underline underline-offset-4', false, spotlightTitle)}
				</h2>

				{@render retractionFlag()}

				{#if tldr}
					<p class="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft @2xl:line-clamp-4">
						{tldr}
					</p>
				{/if}

				<div class="mt-5 border-t border-border/50 pt-3">
					{@render cardFooter()}
				</div>
			</div>
		</div>
	</article>
{:else}
	<article class="group flex flex-col">
		{@render cardLink('block overflow-hidden rounded-[12px]', true, standardMedia)}

		<div class="flex min-w-0 flex-1 flex-col pt-2.5">
			<h3 class="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
				{@render cardLink(
					'line-clamp-3 break-words hover:underline underline-offset-4',
					false,
					standardTitle
				)}
			</h3>

			{@render retractionFlag()}

			<div class="mt-auto pt-3">
				{@render cardFooter()}
			</div>
		</div>
	</article>
{/if}

{#snippet spotlightMedia()}
	{@render mediaContent(cn('w-full', mediaHeight))}
{/snippet}
{#snippet spotlightTitle()}{title}{/snippet}
{#snippet standardMedia()}
	{@render mediaContent(
		'aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90'
	)}
{/snippet}
{#snippet standardTitle()}{title}{/snippet}
