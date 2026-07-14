<script lang="ts">
	import { Icon, ArrowUpRightIcon, SparklesIcon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import type { HouseAd, HouseAdAccent } from '$lib/features/discovery/house-ads';

	// Banner house-ad (slot promo produk) untuk feed Explore. Layout split editorial:
	// panel gambar (kiri) + panel konten (kanan), surface card solid + border.
	const ACCENT_SOFT: Record<HouseAdAccent, string> = {
		mint: 'bg-mint-soft',
		lavender: 'bg-lavender-soft',
		coral: 'bg-coral-soft'
	};
	const ACCENT_FG: Record<HouseAdAccent, string> = {
		mint: 'text-mint-foreground',
		lavender: 'text-lavender-foreground',
		coral: 'text-coral-foreground'
	};
	const ACCENT_DOT: Record<HouseAdAccent, string> = {
		mint: 'bg-mint-foreground',
		lavender: 'bg-lavender-foreground',
		coral: 'bg-coral-foreground'
	};

	let { ad }: { ad: HouseAd } = $props();
</script>

{#snippet cta()}
	<span
		class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]"
	>
		{ad.ctaLabel}
		<Icon icon={ArrowUpRightIcon} class="size-3.5" />
	</span>
{/snippet}

<aside
	class="group grid overflow-hidden rounded-2xl border border-border bg-card transition-shadow duration-200 hover:shadow-md @md/feed:grid-cols-[minmax(0,40%)_minmax(0,1fr)]"
>
	<!-- Panel gambar — flush ke tepi card. Latar accent-soft solid (terlihat bila PNG transparan). -->
	<div
		class={cn(
			'relative aspect-[16/10] w-full overflow-hidden @md/feed:aspect-auto @md/feed:h-full',
			ACCENT_SOFT[ad.accent]
		)}
	>
		{#if ad.image}
			<img
				src={ad.image}
				alt=""
				class="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
			/>
		{:else}
			<div class="flex h-full items-center justify-center">
				<Icon icon={SparklesIcon} class={cn('size-10', ACCENT_FG[ad.accent])} />
			</div>
		{/if}
	</div>

	<!-- Panel konten -->
	<div class="relative flex flex-col justify-center gap-2.5 px-6 py-7 @2xl:px-8">
		<span
			class="absolute right-4 top-4 font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground/70"
		>
			dari aqsha
		</span>
		<div class="flex items-center gap-2">
			<span class={cn('size-1.5 shrink-0 rounded-full', ACCENT_DOT[ad.accent])}></span>
			<p class={cn('font-mono text-[11px] font-medium tracking-wide', ACCENT_FG[ad.accent])}>
				{ad.eyebrow}
			</p>
		</div>
		<h3 class="font-heading text-[21px] font-bold leading-tight tracking-tight text-foreground">
			{ad.title}
		</h3>
		<p class="max-w-[460px] text-[13.5px] leading-relaxed text-muted-foreground">
			{ad.body}
		</p>
		<div class="mt-2.5">
			{#if ad.external}
				<a href={ad.href} target="_blank" rel="noreferrer">
					{@render cta()}
				</a>
			{:else}
				<a href={ad.href}>
					{@render cta()}
				</a>
			{/if}
		</div>
	</div>
</aside>
