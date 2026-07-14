<script lang="ts">
	import { Icon, ExternalLinkIcon, type IconSvgElement } from '$lib/icons';
	import {
		faviconUrl,
		originMeta,
		sourceDomain,
		sourceHref
	} from '$lib/features/threads/lib/source-card';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';

	/**
	 * Daftar kartu sumber ringkas (preview) — port lokal `SourceCardList` + `SourceCard` dari
	 * `apps/web/features/threads/components/deep-search-cards.tsx`. Dipakai `ResultsTimeline` untuk
	 * menampilkan kartu sumber `[n]` yang dipilih di bawah chart. Satu sumber = BARIS TUNGGAL:
	 * logo kecil (favicon → ikon origin) + judul (truncate) + badge `[n]` opsional + afordans outbound.
	 */
	let { sources }: { sources: SourceCardData[] } = $props();
</script>

{#snippet row(
	source: SourceCardData,
	icon: IconSvgElement,
	favicon: string | null,
	href: string | null
)}
	<span
		class="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors group-hover:bg-muted/50"
	>
		<span
			aria-hidden="true"
			class="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-muted"
		>
			{#if favicon}
				<span class="size-3 bg-cover bg-center" style={`background-image: url("${favicon}")`}
				></span>
			{:else}
				<Icon {icon} class="size-2.5 text-muted-foreground" />
			{/if}
		</span>
		<span class="min-w-0 flex-1 truncate text-[12px] text-foreground leading-5">
			{source.title}
		</span>
		{#if source.citationNumber != null}
			<span class="shrink-0 font-medium text-[10px] text-muted-foreground tabular-nums">
				[{source.citationNumber}]
			</span>
		{/if}
		{#if href}
			<Icon
				icon={ExternalLinkIcon}
				class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
			/>
		{/if}
	</span>
{/snippet}

{#if sources.length > 0}
	<div class="flex flex-col gap-0.5 p-1">
		{#each sources as source (source.key)}
			{@const meta = originMeta(source.origin)}
			{@const domain = sourceDomain(source)}
			{@const favicon = faviconUrl(domain)}
			{@const href = sourceHref(source)}
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					title={domain ?? meta.label}
					class="group block min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{@render row(source, meta.icon, favicon, href)}
				</a>
			{:else}
				<span class="group block min-w-0" title={domain ?? meta.label}>
					{@render row(source, meta.icon, favicon, href)}
				</span>
			{/if}
		{/each}
	</div>
{/if}
