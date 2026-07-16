<script module lang="ts">
	/** Scroll anchor for the "bacaan hari ini" cue on the /app landing (this section sits below the fold). */
	export const HOME_EXPLORE_SECTION_ID = 'home-explore';
</script>

<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fly } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Icon, ArrowUpRightIcon } from '$lib/icons';
	import { getComposerMentions } from '$lib/features/threads/state/composer-mentions.svelte';
	import SectionHeader from '$lib/features/explore/components/SectionHeader.svelte';
	import { useFeedHome, useHideDiscovery, useRecordInteraction } from '../api';
	import { discoveryItemToContextRef } from '../ask-astra';
	import { DISCOVERY_TOPICS } from '../nav';
	import { discoveryItemKey, feedItemToDiscoveryItem } from '../model';
	import { FEED_TOPIC_LABELS } from '../types';
	import DiscoveryItemCard, { type DiscoveryCardHandlers } from './DiscoveryItemCard.svelte';

	/**
	 * Discovery teaser on /app (below the composer). One short beat — a sliver of the real feed (1 hero +
	 * 2 grid) using the same editorial cards as Explore + topic pills (deep-links) — enough to bait a
	 * scroll then funnel to /app/explore.
	 */
	const PILLS = [
		{ label: 'Semua', href: '/app/explore' },
		...DISCOVERY_TOPICS.map((t) => ({
			label: FEED_TOPIC_LABELS[t],
			href: `/app/explore?topic=${t}`
		}))
	];

	const query = useFeedHome();
	const hide = useHideDiscovery();
	const record = useRecordInteraction();
	const mentions = getComposerMentions();
	const hidden = new SvelteSet<string>();

	const items = $derived(
		(query.data ?? [])
			.map(feedItemToDiscoveryItem)
			.filter((it) => !hidden.has(discoveryItemKey(it)))
			.slice(0, 3)
	);
	const hero = $derived(items[0]);
	const rest = $derived(items.slice(1));
	const showFeed = $derived(!query.isPending && items.length > 0);
	const reduce = $derived(prefersReducedMotion.current);

	const handlers: DiscoveryCardHandlers = {
		onAskAstra: (item) => {
			record.mutate({ itemRef: item.itemRef, kind: 'research' });
			// Landing /app: the composer is inline → pin the item as a context token (not a seed nav).
			const ref = discoveryItemToContextRef(item);
			if (ref) mentions.setAmbientContextRefs([ref]);
		},
		onSaved: (item) => record.mutate({ itemRef: item.itemRef, kind: 'save' }),
		onHide: (item) => {
			hidden.add(discoveryItemKey(item));
			hide.mutate(item.itemRef, { onError: () => toast.error('Gagal menyembunyikan.') });
		}
	};
</script>

{#if showFeed}
	<!-- Fade + rise the teaser in (transform/opacity) so the resolved feed materializes instead of hard-cutting. -->
	<div
		id={HOME_EXPLORE_SECTION_ID}
		class="mx-auto w-full max-w-5xl scroll-mt-6 px-4 pt-14 pb-20 @2xl:px-8"
		in:fly={reduce ? { duration: 0 } : { y: 8, duration: 300 }}
	>
		<section>
			<SectionHeader title="Jelajahi" subtitle="Paper & berita pilihan buat kamu">
				{#snippet right()}
					<a
						href="/app/explore"
						class="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						Lihat semua <Icon icon={ArrowUpRightIcon} class="size-3.5" />
					</a>
				{/snippet}
			</SectionHeader>

			<div class="mt-4 flex flex-wrap gap-2">
				{#each PILLS as pill (pill.href)}
					<a
						href={pill.href}
						class="rounded-full border border-border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:text-foreground"
					>
						{pill.label}
					</a>
				{/each}
			</div>

			<div class="@container/feed mt-7 space-y-9">
				{#if hero}
					<DiscoveryItemCard variant="hero" item={hero} busy={false} {handlers} />
				{/if}
				{#if rest.length > 0}
					<div class="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2">
						{#each rest as item (discoveryItemKey(item))}
							<DiscoveryItemCard variant="standard" {item} busy={false} {handlers} />
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>
{/if}
