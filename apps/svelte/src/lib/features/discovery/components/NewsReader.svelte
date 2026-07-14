<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { useFeedItem, useHideDiscovery, useRecordInteraction, useRelated } from '../api';
	import { getComposerMentions } from '$lib/features/threads/state/composer-mentions.svelte';
	import { discoveryItemToContextRef } from '../ask-astra';
	import { discoveryItemKey, feedItemToDiscoveryItem, type DiscoveryItem } from '../model';
	import { domainFromUrl, relativeTime } from '../format';
	import DiscoveryItemCard, { type DiscoveryCardHandlers } from './DiscoveryItemCard.svelte';
	import {
		AstraAgentAvatars,
		Eyebrow,
		ExpandableText,
		PillCta,
		ReaderEmpty,
		ReaderLoader,
		ReaderSection,
		ReaderShell
	} from './reader-ui';

	/**
	 * News reader: getFeedItem(id) + related. Header + media reveal + lead + article body. `onAskAstra`
	 * (provided by the shell) opens the chat panel. Port of the `NewsReader` half of
	 * `apps/web/features/discovery/components/news-reader.tsx`.
	 */
	let { id, onAskAstra }: { id: string; onAskAstra: () => void } = $props();

	const query = useFeedItem(() => id);
	const related = useRelated(() => id);
	const hide = useHideDiscovery();
	const record = useRecordInteraction();
	const mentions = getComposerMentions();

	const item = $derived(query.data);
	const ok = $derived(Boolean(item && item.kind === 'news'));

	// "Tanya Astra" (main/related card): pin the item as a context token + open the chat panel.
	function openAstraFor(di: DiscoveryItem): void {
		const ref = discoveryItemToContextRef(di);
		if (ref) mentions.setAmbientContextRefs([ref]);
		onAskAstra();
	}

	const handlers: DiscoveryCardHandlers = {
		onAskAstra: (r) => {
			record.mutate({ itemRef: r.itemRef, kind: 'research' });
			openAstraFor(r);
		},
		onSaved: (r) => record.mutate({ itemRef: r.itemRef, kind: 'save' }),
		onHide: (r) => hide.mutate(r.itemRef, { onError: () => toast.error('Gagal menyembunyikan.') })
	};

	const lead = $derived(ok && item ? item.tldr : undefined);
	// Prefer the extracted article body; fall back to summary when there is no lead & no enrichment yet.
	const body = $derived(
		ok && item ? (item.articleText ?? (lead ? undefined : item.summary)) : undefined
	);
	const sourceUrl = $derived(ok && item ? (item.resolvedUrl ?? item.url) : undefined);
	const domain = $derived(sourceUrl ? domainFromUrl(sourceUrl) : null);
	const time = $derived(ok && item ? relativeTime(item.publishedAt) : null);

	function askAstra(): void {
		if (!ok || !item) return;
		const di = feedItemToDiscoveryItem(item);
		record.mutate({ itemRef: di.itemRef, kind: 'research' });
		openAstraFor(di);
	}
</script>

<ReaderShell width="news">
	{#if query.isPending}
		<ReaderLoader />
	{:else if !ok || !item}
		<ReaderEmpty
			title="Berita tidak ditemukan"
			message="Tautannya mungkin sudah kedaluwarsa. Kembali ke Jelajahi untuk temuan terbaru."
		/>
	{:else}
		<article class="mt-7">
			<div class="flex items-center gap-2.5">
				<Eyebrow tone="lemon">Berita</Eyebrow>
				<span class="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
					{#if domain}
						<img
							src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
							alt=""
							aria-hidden="true"
							class="size-4 rounded-sm"
						/>
					{/if}
					<span class="truncate font-medium text-foreground/85">{item.sourceLabel}</span>
					{#if time}<span class="shrink-0">· {time}</span>{/if}
				</span>
			</div>

			<h1
				class="mt-4 font-serif text-[28px] leading-[1.14] tracking-tight text-foreground @2xl:text-[38px]"
			>
				{item.title}
			</h1>

			{#if item.imageUrl}
				<figure class="mt-6 rounded-3xl border border-border/60 bg-muted/40 p-1.5">
					<div
						class="relative aspect-[16/9] w-full overflow-hidden rounded-[calc(1.5rem-0.375rem)] bg-muted"
					>
						<img
							src={item.imageUrl}
							alt={item.title}
							class="absolute inset-0 h-full w-full object-cover"
						/>
					</div>
				</figure>
			{/if}

			<div class="mt-6 flex flex-wrap items-center gap-2.5">
				<PillCta href={sourceUrl}>Baca di sumber asli</PillCta>
				<PillCta variant="outline" onClick={askAstra} bareIcon>
					{#snippet icon()}<AstraAgentAvatars />{/snippet}
					Tanya Astra
				</PillCta>
			</div>

			{#if lead}
				<p
					class="mt-7 border-l-2 border-lemon-soft-border pl-4 text-[17px] font-medium leading-[1.6] text-foreground"
				>
					{lead}
				</p>
			{/if}

			{#if body}
				<div class="mt-5">
					<ExpandableText text={body} clampLines={12} />
				</div>
			{:else if !lead}
				<p class="mt-7 text-sm leading-relaxed text-muted-foreground">
					Kami belum sempat merangkum berita ini. Buka sumber aslinya untuk membaca selengkapnya.
				</p>
			{/if}
		</article>
	{/if}

	{#if related.data && related.data.length > 0}
		<ReaderSection title="Bacaan lain untukmu" class="mt-14">
			<div class="@container/feed">
				<div class="grid grid-cols-1 gap-x-6 gap-y-9 @lg/feed:grid-cols-2 @3xl/feed:grid-cols-3">
					{#each related.data as r (discoveryItemKey(feedItemToDiscoveryItem(r)))}
						<DiscoveryItemCard
							variant="standard"
							item={feedItemToDiscoveryItem(r)}
							busy={false}
							{handlers}
						/>
					{/each}
				</div>
			</div>
		</ReaderSection>
	{/if}
</ReaderShell>
