<script lang="ts">
	import { reveal, revealUp } from '$lib/motion';
	import { formatDateId } from '$lib/dates';
	import type { TeaserLatest } from '../types';

	// WhatsNewTeaserSection — momen "rilis terbaru" terpusat & compact, tepat sebelum CTA penutup.
	// Aksen tanggal pakai token app `text-chart-1`. Port `whats-new-teaser-section.tsx`.
	let { latest = null }: { latest?: TeaserLatest | null } = $props();

	const revealOnce = reveal();
</script>

{#if latest}
	<section class="w-full bg-background py-14 sm:py-16">
		<div class="{revealUp} mx-auto w-full max-w-2xl px-4 text-center sm:px-6" {@attach revealOnce}>
			<p class="text-sm font-medium text-chart-1">
				<time datetime={latest.publishedAt}>{formatDateId(latest.publishedAt)}</time> · Rilis terbaru
			</p>

			<h2 class="mt-2 text-balance text-xl font-semibold leading-tight text-foreground sm:text-2xl">
				<a href={latest.href} class="transition-colors hover:text-foreground/70">{latest.title}</a>
			</h2>

			{#if latest.summary}
				<p class="mx-auto mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground">
					{latest.summary}
				</p>
			{/if}

			<div class="mt-4">
				<a
					href="/changelog"
					class="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
				>
					Lihat semua pembaruan
				</a>
			</div>
		</div>
	</section>
{/if}
