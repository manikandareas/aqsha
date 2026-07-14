<script lang="ts">
	import { Icon, PlusIcon } from '$lib/icons';
	import { viewerContext } from '$lib/auth';
	import { cn } from '$lib/utils';
	import { FEED_TOPIC_LABELS, type FeedTopic } from '$lib/features/discovery/types';
	import { DISCOVERY_TOPICS } from '$lib/features/discovery/nav';
	import ExploreAskBar from './ExploreAskBar.svelte';

	/**
	 * Explore command bar (Row 0). Short greeting + wide ask-bar (page anchor) + interest pills. A pill
	 * is a real FeedTopic → clicking scopes the feed. Analytics widgets (Pulse/Constellation…) live in the
	 * page-level bento below, not here. Port of `apps/web/features/explore/components/explore-hero.tsx`.
	 */
	let {
		activeTopic,
		onSelectTopic,
		query,
		onSubmitQuery,
		compact = false
	}: {
		activeTopic: FeedTopic | null;
		onSelectTopic: (topic: FeedTopic | null) => void;
		query: string;
		onSubmitQuery: (q: string) => void;
		compact?: boolean;
	} = $props();

	const PILLS: { id: FeedTopic | null; label: string }[] = [
		{ id: null, label: 'Semua' },
		...DISCOVERY_TOPICS.map((t) => ({ id: t, label: FEED_TOPIC_LABELS[t] }))
	];

	const viewer = viewerContext.get();
	const name = $derived(viewer.display({ name: '', email: '' }).name);
	const firstName = $derived(name.trim().split(/\s+/)[0] ?? '');
	const greeting = $derived(
		firstName
			? `${firstName}, mulai dari topik yang lagi hangat.`
			: 'Mulai dari topik yang lagi hangat.'
	);
</script>

{#if compact}
	<section class="pt-6 pb-2">
		<ExploreAskBar value={query} onSubmit={onSubmitQuery} />
	</section>
{:else}
	<section class="pt-10 pb-2 @2xl:pt-12">
		<h1
			class="font-heading mb-6 max-w-[760px] text-[clamp(30px,3.6vw,46px)] leading-[1.07] font-medium tracking-tight text-balance text-foreground"
		>
			{greeting}
		</h1>

		<ExploreAskBar value={query} onSubmit={onSubmitQuery} />

		<div class="mt-6 flex flex-wrap items-center gap-2">
			{#each PILLS as pill (pill.id ?? 'all')}
				{@const active = pill.id === activeTopic}
				<button
					type="button"
					onclick={() => onSelectTopic(pill.id)}
					aria-pressed={active}
					class={cn(
						'rounded-full border px-4 py-2 text-[13px] font-medium transition-[transform,border-color,background-color,color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]',
						active
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40'
					)}
				>
					{pill.label}
				</button>
			{/each}
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-2 font-mono text-[11px] text-muted-foreground transition-[transform,border-color,color] duration-150 ease-out hover:border-primary hover:text-primary active:scale-[0.97]"
			>
				<Icon icon={PlusIcon} class="size-3.5" /> Atur
			</button>
		</div>
	</section>
{/if}
