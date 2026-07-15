<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { HOUSE_ADS } from '$lib/features/discovery/house-ads';
	import { useBillingCurrent } from '$lib/features/settings/api';
	import { deepRunsQuota, isCreditsLow } from '$lib/features/settings/lib/billing-derived';
	import { cn } from '$lib/utils';

	/**
	 * Small landing banner on /app (moved from the sidebar usage card) — a Manus-style autoslide carousel:
	 * one wide card aligned with the composer, left content + right thumbnail, dots below. Slides = billing
	 * usage summary + house-ads (reuse HOUSE_ADS from Explore). Autoslide pauses on hover/focus and stops
	 * entirely under prefers-reduced-motion.
	 */
	const BILLING_HREF = '/app/settings/usage-billing';
	const NUM = new Intl.NumberFormat('id-ID');
	const DAY_MS = 86_400_000;
	const SLIDE_INTERVAL_MS = 6_000;

	// Per-slide illustration — ONLY in the /app carousel; the Explore feed keeps its original house-ad
	// creative. Key = slide id. The SVGs have varied ratios → rendered object-contain, not cover.
	const BANNER_IMAGE: Record<string, string> = {
		usage: '/package-service.svg',
		'astra-deep': '/javascript-illustration.svg',
		'aqsha-app': '/video-call.svg'
	};

	type BannerSlide = {
		id: string;
		href: string;
		external?: boolean;
		title: string;
		subtitle: string;
		image?: string;
		/** Mini credit bar — only on the usage slide for a metered plan. */
		meter?: { pct: number; low: boolean };
	};

	function resetLabel(resetAt: number): string {
		const days = Math.max(0, Math.ceil((resetAt - Date.now()) / DAY_MS));
		if (days <= 0) return 'reset hari ini';
		if (days === 1) return 'reset besok';
		return `reset ${days} hari lagi`;
	}

	const billing = useBillingCurrent();

	// Usage slide from the billing snapshot (null while loading/failed → the carousel runs without it).
	const usageSlide = $derived.by<BannerSlide | null>(() => {
		const data = billing.data;
		if (!data) return null;
		const deep = deepRunsQuota(data);
		const deepLabel = deep.unlimited
			? 'riset mendalam tanpa batas'
			: `${NUM.format(deep.remaining)} riset mendalam tersisa`;
		if (data.isUnlimitedCredits) {
			return {
				id: 'usage',
				href: BILLING_HREF,
				title: `Paket ${data.planLabel} — kredit tak terbatas ∞`,
				subtitle: `${deepLabel} · kelola langganan`,
				image: '/pro-card.png'
			};
		}
		const pct =
			data.creditsLimit <= 0
				? 0
				: Math.min(100, Math.round((data.creditsUsed / data.creditsLimit) * 100));
		return {
			id: 'usage',
			href: BILLING_HREF,
			title: `Sisa ${NUM.format(data.creditsRemaining)} dari ${NUM.format(data.creditsLimit)} kredit`,
			subtitle: `Paket ${data.planLabel} · ${resetLabel(data.resetAt)} · ${deepLabel}${
				data.planKey === 'free' ? ' · upgrade untuk kuota lebih besar' : ''
			}`,
			image: '/pro-card.png',
			meter: { pct, low: isCreditsLow(data) }
		};
	});

	const slides = $derived<BannerSlide[]>(
		[
			...(usageSlide ? [usageSlide] : []),
			...HOUSE_ADS.map((ad) => ({
				id: ad.id,
				href: ad.href,
				external: ad.external,
				title: ad.title,
				subtitle: ad.body,
				image: ad.image
			}))
		].map((slide) => ({ ...slide, image: BANNER_IMAGE[slide.id] ?? slide.image }))
	);

	let index = $state(0);
	// `paused` is intentionally state (not a plain let): a change must restart the interval below so the
	// slide holds a full SLIDE_INTERVAL_MS again after unhover.
	let paused = $state(false);

	const reduced = $derived(prefersReducedMotion.current);
	// Slide count can change once billing loads → modulo so index never goes out of range.
	const active = $derived(slides.length > 0 ? index % slides.length : 0);

	$effect(() => {
		if (paused || reduced || slides.length < 2) return;
		const timer = setInterval(() => (index += 1), SLIDE_INTERVAL_MS);
		return () => clearInterval(timer);
	});
</script>

{#if slides.length > 0}
	<section aria-label="Info paket dan fitur" class="grid w-full gap-2.5">
		<div
			class="overflow-hidden rounded-[14px] border border-border bg-card transition-shadow duration-200 hover:shadow-sm"
			onpointerenter={() => (paused = true)}
			onpointerleave={() => (paused = false)}
			onfocuscapture={() => (paused = true)}
			onblurcapture={() => (paused = false)}
			role="group"
		>
			<div
				class={cn('flex', !reduced && 'transition-transform duration-500 ease-out')}
				style="transform: translateX(-{active * 100}%)"
			>
				{#each slides as slide, slideIndex (slide.id)}
					{@render slideCard(slide, slideIndex !== active)}
				{/each}
			</div>
		</div>

		{#if slides.length > 1}
			<div class="flex items-center justify-center gap-1.5">
				{#each slides as slide, slideIndex (slide.id)}
					<button
						type="button"
						onclick={() => (index = slideIndex)}
						aria-label={`Tampilkan slide ${slideIndex + 1} dari ${slides.length}`}
						aria-current={slideIndex === active}
						class={cn(
							'size-1.5 rounded-full transition-[background-color,transform] duration-200 ease-out',
							slideIndex === active
								? 'scale-110 bg-foreground/70'
								: 'bg-muted-foreground/30 hover:bg-muted-foreground/55'
						)}
					></button>
				{/each}
			</div>
		{/if}
	</section>
{/if}

{#snippet slideBody(slide: BannerSlide)}
	<div class="grid min-w-0 flex-1 gap-1">
		<p class="truncate text-[13.5px] font-semibold leading-snug text-card-foreground">
			{slide.title}
		</p>
		{#if slide.meter}
			<div class="h-1 max-w-[240px] overflow-hidden rounded-full bg-muted">
				<div
					class={cn(
						'h-full rounded-full transition-[width] duration-500 ease-out',
						slide.meter.low ? 'bg-amber-500' : 'bg-primary'
					)}
					style="width: {slide.meter.pct}%"
				></div>
			</div>
		{/if}
		<p class="line-clamp-1 text-[12px] leading-snug text-muted-foreground">{slide.subtitle}</p>
	</div>
	<div class="relative h-12 w-20 shrink-0 sm:h-14 sm:w-24">
		{#if slide.image}
			<img src={slide.image} alt="" class="absolute inset-0 h-full w-full object-contain" />
		{/if}
	</div>
{/snippet}

{#snippet slideCard(slide: BannerSlide, hidden: boolean)}
	{@const slideClass =
		'flex w-full shrink-0 items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 focus-visible:outline-none'}
	{#if slide.external}
		<a
			href={slide.href}
			target="_blank"
			rel="noreferrer"
			class={slideClass}
			tabindex={hidden ? -1 : undefined}
			aria-hidden={hidden || undefined}
		>
			{@render slideBody(slide)}
		</a>
	{:else}
		<a
			href={slide.href}
			class={slideClass}
			tabindex={hidden ? -1 : undefined}
			aria-hidden={hidden || undefined}
		>
			{@render slideBody(slide)}
		</a>
	{/if}
{/snippet}
