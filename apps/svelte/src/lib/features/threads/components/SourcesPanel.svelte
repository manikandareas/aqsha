<script lang="ts">
	import { Icon, ArrowUpRightIcon, type IconSvgElement } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { originMeta } from '../lib/source-card';
	import type { SourceCardData } from '../lib/timeline-types';

	/**
	 * Body daftar sumber per-turn (kartu kaya: nomor sitasi + ikon origin + judul + cuplikan + label).
	 * Dipisah dari `sources-panel.tsx` sebagai badan yang bisa dipakai ulang: `InlineSources`
	 * memakainya sebagai isi collapsible fallback, dan panel detail memakainya sebagai body penuh.
	 * Urut sesuai nomor sitasi `[n]` supaya cocok urutan prosa. Pemanggil menyiapkan kartu;
	 * kosong → tak render.
	 */
	let { sources, class: className }: { sources: SourceCardData[]; class?: string } = $props();

	// Urut sesuai nomor sitasi [n] (yang belum bernomor di belakang) supaya cocok urutan prosa.
	const sorted = $derived(
		[...sources].sort(
			(a, b) =>
				(a.citationNumber ?? Number.MAX_SAFE_INTEGER) -
				(b.citationNumber ?? Number.MAX_SAFE_INTEGER)
		)
	);
</script>

{#snippet body(source: SourceCardData, href: string | null, label: string, icon: IconSvgElement)}
	<div class="flex gap-2.5">
		{#if source.citationNumber != null}
			<span class="mt-0.5 shrink-0 font-medium text-[11px] text-muted-foreground tabular-nums">
				[{source.citationNumber}]
			</span>
		{/if}
		<Icon {icon} class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-1.5">
				<p class="truncate font-medium text-xs">{source.title}</p>
				{#if href}
					<Icon icon={ArrowUpRightIcon} class="size-3 shrink-0 text-muted-foreground" />
				{/if}
			</div>
			{#if source.snippet}
				<p class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{source.snippet}</p>
			{/if}
			<span class="mt-1 inline-block text-[10px] text-muted-foreground/70">{label}</span>
		</div>
	</div>
{/snippet}

{#if sorted.length > 0}
	<div class={cn('flex flex-col gap-1.5', className)}>
		{#each sorted as source (source.key)}
			{@const meta = originMeta(source.origin)}
			{@const href = source.url ?? (source.doi ? `https://doi.org/${source.doi}` : null)}
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					class="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
				>
					{@render body(source, href, meta.label, meta.icon)}
				</a>
			{:else}
				<div class="rounded-lg border bg-card px-3 py-2">
					{@render body(source, href, meta.label, meta.icon)}
				</div>
			{/if}
		{/each}
	</div>
{/if}
