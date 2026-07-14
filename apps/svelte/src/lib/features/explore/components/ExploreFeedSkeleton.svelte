<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';

	// Skeleton feed Explore — meniru layout nyata ExploreFindings (hero spotlight
	// image-right → grid 3-up standard card → feature card) supaya loading tidak
	// menggeser layout (CLS) & terasa instan.
	const STANDARD_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];
</script>

<div class="space-y-10" role="status" aria-label="Memuat temuan…">
	{@render spotlightCardSkeleton('hero', 'right')}
	<div class="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3">
		{#each STANDARD_KEYS as key (key)}
			{@render standardCardSkeleton()}
		{/each}
	</div>
	{@render spotlightCardSkeleton('feature', 'left')}
</div>

<!-- Mirror DiscoverySpotlightCard: grid media + kolom teks (judul 2 baris, tldr 3 baris, footer). -->
{#snippet spotlightCardSkeleton(size: 'hero' | 'feature', imageSide: 'left' | 'right')}
	{@const mediaHeight =
		size === 'hero'
			? 'h-52 @2xl:h-64 @xl/feed:h-full @xl/feed:min-h-[300px]'
			: 'h-48 @2xl:h-56 @xl/feed:h-full @xl/feed:min-h-[224px]'}
	{@const titleHeight = size === 'hero' ? 'h-7 @2xl:h-8' : 'h-6 @2xl:h-7'}
	{@const columns =
		imageSide === 'left'
			? '@xl/feed:grid-cols-[minmax(260px,40%)_minmax(0,1fr)]'
			: '@xl/feed:grid-cols-[minmax(0,1fr)_minmax(260px,40%)]'}
	<article>
		<div class={cn('grid gap-5 @xl/feed:items-stretch @xl/feed:gap-7', columns)}>
			<div class={cn('order-1', imageSide === 'left' ? '@xl/feed:order-1' : '@xl/feed:order-2')}>
				<Skeleton class={cn('w-full rounded-[12px]', mediaHeight)} />
			</div>

			<div
				class={cn(
					'order-2 flex min-w-0 flex-col justify-center',
					imageSide === 'left' ? '@xl/feed:order-2' : '@xl/feed:order-1'
				)}
			>
				<div class="space-y-2.5">
					<Skeleton class={cn('w-[92%]', titleHeight)} />
					<Skeleton class={cn('w-[64%]', titleHeight)} />
				</div>
				<div class="mt-4 space-y-2">
					<Skeleton class="h-3.5 w-full" />
					<Skeleton class="h-3.5 w-full" />
					<Skeleton class="h-3.5 w-[78%]" />
				</div>
				<div class="mt-5 border-t border-border/50 pt-3">
					{@render footerSkeleton()}
				</div>
			</div>
		</div>
	</article>
{/snippet}

<!-- Mirror DiscoveryStandardCard: media aspect-16/10 + judul 2 baris + footer. -->
{#snippet standardCardSkeleton()}
	<article class="flex flex-col">
		<Skeleton class="aspect-[16/10] w-full rounded-[12px]" />
		<div class="flex min-w-0 flex-1 flex-col pt-2.5">
			<div class="space-y-2">
				<Skeleton class="h-4 w-full" />
				<Skeleton class="h-4 w-[70%]" />
			</div>
			<div class="mt-auto pt-3">
				{@render footerSkeleton()}
			</div>
		</div>
	</article>
{/snippet}

<!-- Mirror CardFooter: avatar sumber size-5 + label, ikon save + overflow di kanan. -->
{#snippet footerSkeleton()}
	<div class="flex items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2">
			<Skeleton class="size-5 shrink-0 rounded-full" />
			<Skeleton class="h-3 w-24" />
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Skeleton class="size-8 rounded-full" />
			<Skeleton class="size-8 rounded-full" />
		</div>
	</div>
{/snippet}
