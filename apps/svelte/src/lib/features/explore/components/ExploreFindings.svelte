<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Icon, CheckCircle2Icon, SparklesIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';
	import { getAuthState } from '$lib/auth';
	import {
		useFeedInfinite,
		useHideDiscovery,
		useRecordInteraction
	} from '$lib/features/discovery/api';
	import {
		discoveryItemKey,
		feedItemToDiscoveryItem,
		type DiscoveryItem
	} from '$lib/features/discovery/model';
	import type { FeedItem, FeedMode, FeedTopic } from '$lib/features/discovery/types';
	import ExploreFeedSkeleton from './ExploreFeedSkeleton.svelte';
	import ExploreFeedSourceRow, {
		type ExploreFeedSourceRowHandlers
	} from './ExploreFeedSourceRow.svelte';

	/** Curated discovery feed keeps one query and a source-list presentation for every topic. */
	let { topic }: { topic: FeedTopic | null } = $props();

	// Bound auto-loads between scrolls so a run of locally-hidden items can't spin forever.
	const MAX_AUTO_LOADS = 4;

	const hidden = new SvelteSet<string>();
	const mode = $derived<FeedMode>(topic ? 'topics' : 'foryou');
	const auth = getAuthState();
	const authReady = () => auth.isSignedIn;
	const feedQuery = useFeedInfinite(
		() => mode,
		() => topic,
		() => authReady()
	);
	const hide = useHideDiscovery();
	const record = useRecordInteraction();

	const items = $derived.by<DiscoveryItem[]>(() => {
		const out: DiscoveryItem[] = [];
		const seen = new SvelteSet<string>();
		for (const page of feedQuery.data?.pages ?? []) {
			for (const raw of page.items) {
				const item = feedItemToDiscoveryItem(raw as FeedItem);
				const key = discoveryItemKey(item);
				if (seen.has(key)) continue;
				seen.add(key);
				if (!hidden.has(key)) out.push(item);
			}
		}
		return out;
	});
	const rawCount = $derived(
		(feedQuery.data?.pages ?? []).reduce((count, page) => count + page.items.length, 0)
	);
	const feedStatus = $derived<'LoadingMore' | 'CanLoadMore' | 'Exhausted'>(
		feedQuery.isFetchingNextPage
			? 'LoadingMore'
			: feedQuery.hasNextPage
				? 'CanLoadMore'
				: 'Exhausted'
	);

	// Cap auto-fetches per session so a run of locally-hidden items can't spin forever.
	let sentinelEl = $state<HTMLDivElement | null>(null);
	let autoLoadCount = 0;
	let prevRaw = 0;
	const sessionKey = $derived(`explore:${mode}:${topic ?? ''}`);

	$effect(() => {
		if (sessionKey.length === 0) return;
		autoLoadCount = 0;
		prevRaw = 0;
	});

	$effect(() => {
		const node = sentinelEl;
		if (!node) return;
		const status = feedStatus;
		const raw = rawCount;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting || status !== 'CanLoadMore') return;
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
		void feedQuery.fetchNextPage();
	}

	const handlers: ExploreFeedSourceRowHandlers = {
		onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: 'save' }),
		onHide: (item) => {
			hidden.add(discoveryItemKey(item));
			hide.mutate(item.itemRef, { onError: () => toast.error('Gagal menyembunyikan.') });
		}
	};
</script>

<section class="pt-8">
	<div
		class={[
			'@container/feed',
			feedQuery.isPlaceholderData && 'opacity-60 transition-opacity duration-200'
		]}
	>
		{#if feedQuery.isError}
			<div
				class="max-w-[760px] rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
			>
				{readableApiErrorMessage(feedQuery.error, 'Gagal memuat.')}
			</div>
		{:else if feedQuery.isPending}
			<ExploreFeedSkeleton />
		{:else if items.length === 0 && feedStatus === 'Exhausted'}
			{@render emptyState()}
		{:else}
			<div
				class="overflow-hidden rounded-lg border-2 border-border bg-card"
				aria-label="Temuan untukmu"
			>
				{#each items as item (discoveryItemKey(item))}
					<ExploreFeedSourceRow {item} {handlers} />
				{/each}
			</div>
			{#if feedStatus !== 'Exhausted'}
				<div bind:this={sentinelEl} aria-hidden="true" class="h-px w-full"></div>
			{/if}
			{@render feedFooter()}
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
		<h3 class="text-[15px] font-semibold text-foreground">Belum ada item</h3>
		<p class="mx-auto mt-1.5 max-w-[380px] text-[13px] font-medium leading-5 text-muted-foreground">
			{#if topic}
				Belum ada konten untuk bidang ini. Coba bidang lain atau kembali setelah pembaruan
				berikutnya.
			{:else}
				Konten akan muncul setelah pembaruan terjadwal berikutnya.
			{/if}
		</p>
	</div>
{/snippet}
