<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Icon, CheckCircle2Icon, SparklesIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { readableApiErrorMessage } from '$lib/errors';
	import {
		useFeedInfinite,
		useHideDiscovery,
		usePaperSearch,
		useRecordInteraction,
		type SearchPaper
	} from '$lib/features/discovery/api';
	import {
		discoveryItemKey,
		feedItemToDiscoveryItem,
		paperToDiscoveryItem,
		type DiscoveryItem
	} from '$lib/features/discovery/model';
	import type { FeedItem, FeedMode, FeedTopic } from '$lib/features/discovery/types';
	import { buildFeedBlocks } from '../feed-blocks';
	import DiscoveryItemCard, {
		type DiscoveryCardHandlers
	} from '$lib/features/discovery/components/DiscoveryItemCard.svelte';
	import HouseAdBanner from '$lib/features/discovery/components/HouseAdBanner.svelte';
	import ExploreFeedSkeleton from './ExploreFeedSkeleton.svelte';
	import SectionHeader from './SectionHeader.svelte';

	/**
	 * "Temuan untukmu" — the real combined paper + news feed, using the editorial discovery cards +
	 * infinite scroll. Scoped by the active interest pill (topic). Empty `q` → personal/topic feed
	 * (Jelajah); non-empty `q` → live paper search (Selidiki).
	 */
	let { topic, query }: { topic: FeedTopic | null; query: string } = $props();

	// Bound auto-loads between scrolls so a run of locally-hidden items can't spin.
	const MAX_AUTO_LOADS = 4;

	const hidden = new SvelteSet<string>();

	const q = $derived(query.trim());
	const searchMode = $derived(q.length > 0);
	const mode = $derived<FeedMode>(topic ? 'topics' : 'foryou');

	// Two infinite queries (browse feed + live paper search); one is enabled at a time.
	const feedQuery = useFeedInfinite(
		() => mode,
		() => topic,
		() => !searchMode
	);
	const searchQuery = usePaperSearch(
		() => query,
		() => undefined,
		() => searchMode
	);
	const hide = useHideDiscovery();
	const record = useRecordInteraction();

	// Map per-mode → dedupe by discovery key → drop locally-hidden.
	const items = $derived.by<DiscoveryItem[]>(() => {
		const out: DiscoveryItem[] = [];
		const seen = new SvelteSet<string>();
		const pages = searchMode ? (searchQuery.data?.pages ?? []) : (feedQuery.data?.pages ?? []);
		for (const page of pages) {
			for (const raw of page.items) {
				const item = searchMode
					? paperToDiscoveryItem(raw as SearchPaper)
					: feedItemToDiscoveryItem(raw as FeedItem);
				const key = discoveryItemKey(item);
				if (seen.has(key)) continue;
				seen.add(key);
				if (!hidden.has(key)) out.push(item);
			}
		}
		return out;
	});
	const rawCount = $derived((feedQuery.data?.pages ?? []).reduce((n, p) => n + p.items.length, 0));

	// One active query object per mode; status derives from it.
	const active = $derived(searchMode ? searchQuery : feedQuery);
	const feedStatus = $derived<'LoadingMore' | 'CanLoadMore' | 'Exhausted'>(
		active.isFetchingNextPage ? 'LoadingMore' : active.hasNextPage ? 'CanLoadMore' : 'Exhausted'
	);

	const hero = $derived(items[0]);
	const blocks = $derived(buildFeedBlocks(items.slice(1), !searchMode));

	// Cap auto-fetches per session so a run of locally-hidden items can't spin forever. Refs stay non-reactive across effect runs.
	let sentinelEl = $state<HTMLDivElement | null>(null);
	let autoLoadCount = 0;
	let prevRaw = 0;
	const sessionKey = $derived(
		searchMode ? `explore:search:${q}` : `explore:${mode}:${topic ?? ''}`
	);

	// Reset the budget when the session (mode/topic/query) changes.
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep read only
		sessionKey;
		autoLoadCount = 0;
		prevRaw = 0;
	});

	// Browse-only auto-load observer (search uses the manual "Muat lagi" button).
	$effect(() => {
		if (searchMode) return;
		const node = sentinelEl;
		if (!node) return;
		const status = feedStatus;
		const raw = rawCount;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				if (status !== 'CanLoadMore') return;
				if (raw !== prevRaw) {
					if (raw > prevRaw) autoLoadCount = 0;
					prevRaw = raw;
				}
				if (autoLoadCount >= MAX_AUTO_LOADS) return;
				autoLoadCount += 1;
				void feedQuery.fetchNextPage();
			},
			{ rootMargin: '600px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	});

	function handleManualLoadMore(): void {
		autoLoadCount = 0;
		prevRaw = rawCount;
		void active.fetchNextPage();
	}

	const handlers: DiscoveryCardHandlers = {
		onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: 'save' }),
		onHide: (item) => {
			hidden.add(discoveryItemKey(item));
			hide.mutate(item.itemRef, { onError: () => toast.error('Gagal menyembunyikan.') });
		}
	};

	const reduce = $derived(prefersReducedMotion.current);
</script>

<!-- Ease the padding + slide the search header in so switching Jelajah↔Selidiki doesn't jump the feed. -->
<section
	class={cn(
		'transition-[padding] duration-200 ease-out motion-reduce:transition-none',
		searchMode ? 'pt-16' : 'pt-8'
	)}
>
	{#if searchMode}
		<div class="mb-5" transition:slide={reduce ? { duration: 0 } : { duration: 200 }}>
			<SectionHeader
				title={`Hasil untuk “${q}”`}
				subtitle="Paper & berita yang cocok dengan pencarianmu"
			>
				{#snippet right()}
					<span class="shrink-0 font-mono text-[11px] text-muted-foreground"
						>{items.length} item</span
					>
				{/snippet}
			</SectionHeader>
		</div>
	{/if}

	<div
		class={cn(
			'@container/feed',
			active.isPlaceholderData && 'opacity-60 transition-opacity duration-200'
		)}
	>
		{#if active.isError}
			<div
				class="max-w-[760px] rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
			>
				{readableApiErrorMessage(active.error, 'Gagal memuat.')}
			</div>
		{:else if active.isPending}
			<ExploreFeedSkeleton />
		{:else if items.length === 0 && feedStatus === 'Exhausted'}
			{@render emptyState()}
		{:else}
			<div class="space-y-10">
				{#if hero}
					<DiscoveryItemCard variant="hero" item={hero} {handlers} />
				{/if}
				{#each blocks as block (block.key)}
					{#if block.kind === 'grid'}
						<div
							class="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3"
						>
							{#each block.items as item, idx (discoveryItemKey(item))}
								<div
									class="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out"
									style="animation-delay: {Math.min(idx, 8) * 40}ms"
								>
									<DiscoveryItemCard variant="standard" {item} {handlers} />
								</div>
							{/each}
						</div>
					{:else if block.kind === 'feature'}
						<div class="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
							<DiscoveryItemCard
								variant="feature"
								item={block.item}
								imageSide={block.side}
								{handlers}
							/>
						</div>
					{:else}
						<div class="animate-in fade-in-0 duration-300 ease-out">
							<HouseAdBanner ad={block.ad} />
						</div>
					{/if}
				{/each}
				{#if !searchMode && feedStatus !== 'Exhausted'}
					<div bind:this={sentinelEl} aria-hidden="true" class="h-px w-full"></div>
				{/if}
				{#if !(searchMode && feedStatus === 'Exhausted')}
					{@render feedFooter()}
				{/if}
			</div>
		{/if}
	</div>
</section>

{#snippet feedFooter()}
	{#if feedStatus === 'Exhausted'}
		<div class="mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-10 text-center">
			<div
				class="flex size-9 items-center justify-center rounded-full bg-mint-soft text-mint-foreground"
			>
				<Icon icon={CheckCircle2Icon} class="size-5" />
			</div>
			<p class="text-[14px] font-semibold text-foreground">Kamu sudah baca semua</p>
			<p class="max-w-[320px] text-[12.5px] text-muted-foreground">
				Segini dulu untuk saat ini. Feed diperbarui berkala — simpan beberapa item untuk diteliti.
			</p>
		</div>
	{:else if feedStatus === 'LoadingMore'}
		<div
			class="flex items-center justify-center py-8 text-[12.5px] font-medium text-muted-foreground"
		>
			Memuat lebih banyak…
		</div>
	{:else}
		<div class="flex justify-center py-8">
			<button
				type="button"
				onclick={handleManualLoadMore}
				class="inline-flex h-9 items-center rounded-full border border-border/80 bg-secondary px-5 font-mono text-[12px] text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
			>
				Muat lagi ↓
			</button>
		</div>
	{/if}
{/snippet}

{#snippet emptyState()}
	<div class="max-w-[560px] rounded-2xl border-2 border-border bg-card px-5 py-8 text-center">
		<div
			class="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-mint-soft text-mint-foreground"
		>
			<Icon icon={SparklesIcon} class="size-5" />
		</div>
		<h3 class="text-[15px] font-semibold text-foreground">
			{searchMode ? 'Tak ada hasil' : 'Belum ada item'}
		</h3>
		<p class="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
			{#if searchMode}
				Tak ada paper atau berita yang cocok dengan “{q}”. Coba kata kunci lain.
			{:else if topic}
				Belum ada konten untuk bidang ini. Coba bidang lain atau kembali setelah pembaruan
				berikutnya.
			{:else}
				Konten akan muncul setelah pembaruan terjadwal berikutnya.
			{/if}
		</p>
	</div>
{/snippet}
