<script lang="ts">
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, ExpandIcon } from '$lib/icons';
	import StatsDecision from './StatsDecision.svelte';
	import StatsFigure from './StatsFigure.svelte';
	import StatsTable from './StatsTable.svelte';

	/**
	 * Render semua blok satu grup uji (tabel → kartu verdict → figur) dalam urutan builder.
	 * `onOpenStats` (opsional) → header kecil dengan tombol buka panel Statistik scoped; hanya dipasang
	 * jalur inline chat (bukan panel scoped itu sendiri, yang me-reuse komponen ini tanpa `onOpenStats`).
	 *
	 * Penomoran "Tabel n"/"Gambar n" digerbangkan via grup sebagai PROP; dihitung per-grup di sini
	 * lalu diteruskan sebagai `assignedNumber` ke `StatsTable`/`StatsFigure`. Kontinuitas antar-grup
	 * dalam satu pesan = tanggung jawab renderer pesan tingkat atas.
	 */
	let { group, onOpenStats }: { group: StatsGroup; onOpenStats?: () => void } = $props();

	// Nomor berurutan sesuai urutan dokumen (dalam grup): tabel & gambar dihitung terpisah.
	const numbered = $derived.by(() => {
		let tables = 0;
		let figures = 0;
		return group.blocks.map((block) => {
			if (block.type === 'stats-table') return { block, number: (tables += 1) };
			if (block.type === 'stats-figure') return { block, number: (figures += 1) };
			return { block, number: undefined };
		});
	});
</script>

{#snippet customBanner(code: string | undefined)}
	<!-- Penanda hasil codegen fallback (`run_python_analysis`) — di luar katalog terverifikasi.
	     Toggle "Lihat kode" (auditability ala Julius AI): kode Python yang dieksekusi bisa diperiksa. -->
	<div class="mt-4 mb-1 not-prose">
		<div class="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium"
			>
				<span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
				Analisis kustom — di luar katalog terverifikasi
			</span>
		</div>
		{#if code}
			<details class="mt-1.5">
				<summary class="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-foreground">
					Lihat kode
				</summary>
				<pre
					class="mt-1 max-h-72 overflow-auto rounded-md border bg-muted/40 p-2.5 text-[11px] leading-4"><code
						>{code}</code
					></pre>
			</details>
		{/if}
	</div>
{/snippet}

<div class="stats-viz-group min-w-0">
	{#if onOpenStats}
		<!-- Header kecil blok hasil inline: judul uji + tombol buka panel Statistik scoped. -->
		<div class="not-prose mt-4 mb-1 flex items-center justify-between gap-2">
			<span class="min-w-0 truncate text-[12px] font-medium text-muted-foreground">
				{group.title}
			</span>
			<button
				type="button"
				onclick={onOpenStats}
				class="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				title="Buka di panel Statistik"
			>
				<Icon icon={ExpandIcon} class="size-3" />
				Buka di panel
			</button>
		</div>
	{/if}
	{#if group.custom}
		{@render customBanner(group.code)}
	{/if}
	{#each numbered as { block, number } (block.id)}
		{#if block.type === 'stats-table'}
			<StatsTable {block} assignedNumber={number} />
		{:else if block.type === 'stats-decision'}
			<StatsDecision {block} />
		{:else if block.type === 'stats-figure'}
			<StatsFigure {block} assignedNumber={number} />
		{/if}
	{/each}
</div>
