<script lang="ts">
	import type { GapsMatrixBlock } from '@aqsha/chat-core/deep-viz';
	import { DESIGN_BUCKET_LABELS } from './labels';

	/**
	 * Matriks celah riset (heatmap outcome × desain studi, ala Consensus): sel = blok warna penuh
	 * dengan count SELALU tertulis (nilai tak pernah color-alone); intensitas = skala SEKUENSIAL
	 * satu hue (`--lavender` via color-mix, dinormalisasi per-matrix, dark/light adaptif). Sel 0 =
	 * polos "–" → celah riset terlihat sebagai "lubang". Kolom pertama sticky + `overflow-x-auto`.
	 */
	let { block }: { block: GapsMatrixBlock } = $props();

	const max = $derived(Math.max(1, ...block.cells.flat()));
	// 14%..58% dari hue lavender — monoton naik, teks foreground tetap terbaca di dua mode.
	const cellBg = (value: number): string | undefined =>
		value > 0
			? `color-mix(in oklab, var(--lavender) ${Math.round(14 + (value / max) * 44)}%, var(--card))`
			: undefined;
</script>

<div class="grid min-w-0 gap-2">
	<div class="min-w-0 overflow-x-auto">
		<table
			class="w-full min-w-[520px] table-fixed border-separate border-spacing-[2px] text-[12.5px]"
		>
			<thead>
				<tr class="text-[12px] text-foreground">
					<th
						class="sticky left-0 z-10 w-[24%] bg-background py-2.5 pr-3 text-left align-bottom font-semibold"
					>
						Topik/outcome
					</th>
					{#each block.cols as col (col)}
						<th class="px-2 py-2.5 text-left align-bottom font-semibold leading-4">
							{DESIGN_BUCKET_LABELS[col]}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each block.rows as row, ri (row)}
					<tr>
						<th
							scope="row"
							class="sticky left-0 z-10 bg-background py-1.5 pr-3 text-left align-middle font-medium text-foreground"
						>
							<span class="block truncate" title={row}>
								{row}
							</span>
						</th>
						{#each block.cols as col, ci (col)}
							{@const value = block.cells[ri]?.[ci] ?? 0}
							{@const bg = cellBg(value)}
							<td class="p-0">
								<div
									class="flex h-11 items-center justify-center rounded-sm font-medium text-foreground tabular-nums"
									style={bg ? `background: ${bg}` : undefined}
									title={`${row} × ${DESIGN_BUCKET_LABELS[col]}: ${value} paper`}
								>
									{#if value > 0}
										{value}
									{:else}
										<span class="text-muted-foreground/50">–</span>
									{/if}
								</div>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="text-[11px] text-muted-foreground/70 leading-4">
		Warna lebih pekat = lebih banyak paper; sel &ldquo;–&rdquo; = belum ada studi (celah riset).
	</p>
</div>
