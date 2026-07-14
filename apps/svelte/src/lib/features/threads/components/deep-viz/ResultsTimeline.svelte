<script lang="ts">
	import type { ResultsTimelineBlock } from '@aqsha/chat-core/deep-viz';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import SourceCardList from './SourceCardList.svelte';

	/**
	 * Timeline publikasi (SVG in-house, tanpa lib chart) ala Consensus: marker = PILL bulat
	 * bernomor `[n]`, ukuran 3 kelas by kuantil `citedByCount` (null → terkecil), disusun per
	 * KOLOM TAHUN dari tengah ke atas/bawah (center-out, deterministik — tanpa Math.random).
	 * Gridline tahun putus-putus + baseline sumbu solid. Tahun yang terlalu padat menampilkan
	 * paper paling banyak disitasi + chip `+k` untuk sisanya (tanpa silent cap — dicatat di
	 * keterangan). Klik pill → kartu sumber di bawah chart (resolve via peta sitasi prop).
	 */

	type SizeClass = { h: number; fs: number; pad: number };
	const SIZES: Record<'lg' | 'md' | 'sm', SizeClass> = {
		lg: { h: 26, fs: 12, pad: 8 },
		md: { h: 20, fs: 10.5, pad: 6 },
		sm: { h: 16, fs: 9, pad: 5 }
	};

	const COL_W = 44;
	const PAD_X = 18;
	const PLOT_TOP = 10;
	const PLOT_H = 236;
	const AXIS_GAP = 10;
	const H = PLOT_TOP + PLOT_H + AXIS_GAP + 24;
	const PILL_GAP = 5;

	type PillLayout = {
		n: number;
		year: number;
		citedByCount: number | null;
		x: number;
		y: number;
		w: number;
		h: number;
		fs: number;
	};

	type OverflowChip = { year: number; x: number; y: number; count: number };

	function pillWidth(n: number, size: SizeClass): number {
		const digits = String(n).length;
		return Math.round(size.pad * 2 + digits * size.fs * 0.64);
	}

	let {
		block,
		citations
	}: { block: ResultsTimelineBlock; citations?: Map<number, SourceCardData[]> } = $props();

	let selected = $state<number | null>(null);

	const layout = $derived.by(() => {
		const yearsSorted = block.points.map((p) => p.year).sort((a, b) => a - b);
		const minYear = yearsSorted[0] ?? 0;
		const maxYear = yearsSorted[yearsSorted.length - 1] ?? 0;
		const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
		const width = PAD_X * 2 + years.length * COL_W;

		// Kuantil citedByCount (non-null) → 3 kelas ukuran; null = kelas terkecil.
		const cited = block.points
			.map((p) => p.citedByCount)
			.filter((v): v is number => v !== null)
			.sort((a, b) => a - b);
		const q = (f: number) => cited[Math.min(cited.length - 1, Math.floor(f * cited.length))] ?? 0;
		const q33 = q(1 / 3);
		const q66 = q(2 / 3);
		const sizeFor = (citedByCount: number | null): SizeClass => {
			if (citedByCount === null || cited.length === 0) return SIZES.sm;
			return citedByCount > q66 ? SIZES.lg : citedByCount > q33 ? SIZES.md : SIZES.sm;
		};

		// Susun per kolom tahun: paling tersitasi dulu (di tengah), lalu selang-seling atas/bawah.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local grouping map in a $derived, not reactive state
		const byYear = new Map<number, ResultsTimelineBlock['points']>();
		for (const point of block.points) {
			if (!byYear.has(point.year)) byYear.set(point.year, []);
			byYear.get(point.year)?.push(point);
		}
		const centerY = PLOT_TOP + PLOT_H / 2;
		const top = PLOT_TOP;
		const bottom = PLOT_TOP + PLOT_H;
		const pills: PillLayout[] = [];
		const overflows: OverflowChip[] = [];
		let hiddenTotal = 0;
		for (const [year, points] of byYear) {
			const x = PAD_X + (year - minYear + 0.5) * COL_W;
			const ordered = [...points].sort(
				(a, b) => (b.citedByCount ?? -1) - (a.citedByCount ?? -1) || a.n - b.n
			);
			let upEdge = centerY;
			let downEdge = centerY;
			let upFull = false;
			let downFull = false;
			let placed = 0;
			for (const [i, point] of ordered.entries()) {
				const size = sizeFor(point.citedByCount);
				// Selang-seling atas/bawah dari tengah; arah yang penuh DILOMPATI (bukan menghentikan
				// seluruh kolom — tinggi pill bervariasi, satu sisi bisa penuh duluan padahal sisi lain
				// masih muat). Berhenti hanya saat kedua arah penuh.
				const tryUp = (): number | null => {
					const candidate = upEdge - PILL_GAP - size.h / 2;
					if (candidate - size.h / 2 < top) {
						upFull = true;
						return null;
					}
					upEdge = candidate - size.h / 2;
					return candidate;
				};
				const tryDown = (): number | null => {
					const candidate = downEdge + PILL_GAP + size.h / 2;
					if (candidate + size.h / 2 > bottom) {
						downFull = true;
						return null;
					}
					downEdge = candidate + size.h / 2;
					return candidate;
				};
				let y: number | null;
				if (i === 0) {
					y = centerY;
					upEdge = centerY - size.h / 2;
					downEdge = centerY + size.h / 2;
				} else if (i % 2 === 1) {
					y = (upFull ? null : tryUp()) ?? (downFull ? null : tryDown());
				} else {
					y = (downFull ? null : tryDown()) ?? (upFull ? null : tryUp());
				}
				if (y === null) break;
				pills.push({
					n: point.n,
					year,
					citedByCount: point.citedByCount,
					x,
					y,
					w: pillWidth(point.n, size),
					h: size.h,
					fs: size.fs
				});
				placed += 1;
			}
			const hidden = ordered.length - placed;
			if (hidden > 0) {
				hiddenTotal += hidden;
				overflows.push({
					year,
					x,
					y: Math.min(bottom - SIZES.sm.h / 2, downEdge + PILL_GAP + SIZES.sm.h / 2),
					count: hidden
				});
			}
		}
		return { pills, overflows, years, width, hiddenTotal };
	});

	const selectedCards = $derived(selected !== null ? (citations?.get(selected) ?? []) : []);
	const axisY = PLOT_TOP + PLOT_H + AXIS_GAP;
</script>

<div class="grid min-w-0 gap-2">
	<div class="min-w-0 overflow-x-auto border-t pt-2">
		<svg
			width={layout.width}
			height={H}
			viewBox={`0 0 ${layout.width} ${H}`}
			class="text-muted-foreground"
			role="img"
			aria-label={`Sebaran ${block.points.length} paper menurut tahun terbit`}
		>
			<!-- Gridline tahun putus-putus (ala referensi) — recessive, di belakang marker. -->
			{#each layout.years as year, i (year)}
				{@const x = PAD_X + (i + 0.5) * COL_W}
				<line
					x1={x}
					x2={x}
					y1={PLOT_TOP}
					y2={axisY - 6}
					stroke="var(--border)"
					stroke-width={1}
					stroke-dasharray="2 6"
				/>
			{/each}
			<line
				x1={0}
				x2={layout.width}
				y1={axisY}
				y2={axisY}
				stroke="var(--border)"
				stroke-width={1}
			/>
			{#each layout.years as year, i (year)}
				{@const x = PAD_X + (i + 0.5) * COL_W}
				<g>
					<line x1={x} x2={x} y1={axisY} y2={axisY + 4} stroke="var(--border)" stroke-width={1} />
					<text {x} y={axisY + 16} text-anchor="middle" font-size={10} class="fill-current">
						{year}
					</text>
				</g>
			{/each}
			{#each layout.pills as pill (`${pill.n}-${pill.year}`)}
				{@const isSelected = selected === pill.n}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<g class="cursor-pointer" onclick={() => (selected = selected === pill.n ? null : pill.n)}>
					<rect
						x={pill.x - pill.w / 2}
						y={pill.y - pill.h / 2}
						width={pill.w}
						height={pill.h}
						rx={Math.min(8, pill.h * 0.34)}
						fill="var(--muted)"
						stroke={isSelected ? 'var(--ring)' : 'none'}
						stroke-width={isSelected ? 1.5 : 0}
					/>
					<text
						x={pill.x}
						y={pill.y}
						text-anchor="middle"
						dominant-baseline="central"
						font-size={pill.fs}
						font-weight={600}
						fill="var(--foreground)"
						class="pointer-events-none font-mono"
					>
						{pill.n}
					</text>
					<title>
						{`[${pill.n}] ${pill.year}${pill.citedByCount !== null ? ` · ${pill.citedByCount} sitasi` : ''}`}
					</title>
				</g>
			{/each}
			{#each layout.overflows as chip (`overflow-${chip.year}`)}
				<g>
					<text
						x={chip.x}
						y={chip.y}
						text-anchor="middle"
						dominant-baseline="central"
						font-size={9}
						font-weight={600}
						class="fill-current font-mono"
					>
						+{chip.count}
					</text>
					<title>{`${chip.count} paper lain tahun ${chip.year}`}</title>
				</g>
			{/each}
		</svg>
	</div>
	<p class="text-[11px] text-muted-foreground/70 leading-4">
		Angka = nomor sumber [n]; klik marker untuk melihat sumbernya.{layout.hiddenTotal > 0
			? ` Tahun yang padat menampilkan paper paling banyak disitasi (+${layout.hiddenTotal} paper lain tersedia di panel sumber).`
			: ''}
	</p>
	{#if selected !== null}
		{#if selectedCards.length > 0}
			<div class="rounded-lg border bg-muted/20 text-[12px]">
				<SourceCardList sources={selectedCards} />
			</div>
		{:else}
			<p class="text-[11px] text-muted-foreground/70">
				Sumber [{selected}] tidak ditemukan di panel sumber.
			</p>
		{/if}
	{/if}
</div>
