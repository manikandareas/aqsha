<script module lang="ts">
	/** Format sel angka gaya SPSS-ID: desimal koma, 3 angka di belakang (kecuali bilangan bulat/count). */
	function formatCell(value: number | string | null): string {
		if (value === null) return '';
		if (typeof value === 'string') return value;
		if (!Number.isFinite(value)) return '';
		if (Number.isInteger(value)) return String(value);
		return value.toFixed(3).replace('.', ',');
	}
</script>

<script lang="ts">
	import type { StatsTableBlock } from '@aqsha/chat-core/stats-viz';

	/**
	 * Tabel gaya output SPSS: judul "Tabel n: …", header kolom, baris angka (desimal koma),
	 * catatan kaki (a., b., …). Nomor "Tabel n" di-assign provider (urutan dokumen) — di web via
	 * React context `useStatsViz().assignTable(block.id)`; di Svelte diteruskan sebagai prop
	 * `assignedNumber`. Wrapper `overflow-x-auto` supaya tabel lebar bisa di-scroll di mobile tanpa
	 * merusak layout.
	 */
	let { block, assignedNumber }: { block: StatsTableBlock; assignedNumber?: number } = $props();

	const number = $derived(block.tableNumber ?? assignedNumber ?? 0);
	const label = $derived(number > 0 ? `Tabel ${number}` : 'Tabel');
	const table = $derived(block.table);
</script>

<figure class="stats-viz my-5 min-w-0 not-prose">
	<figcaption class="mb-2 flex min-w-0 items-baseline gap-2 text-[12px] leading-4">
		<span class="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
			{label}
		</span>
		<span class="min-w-0 font-semibold text-foreground">{table.title}</span>
	</figcaption>
	<div class="min-w-0 overflow-x-auto rounded-lg border">
		<table class="w-full border-collapse text-left text-[12.5px]">
			{#if table.columns.length > 0}
				<thead>
					<tr class="border-b bg-muted/40 text-[12px] text-foreground">
						{#each table.columns as col, i (`${i}-${col}`)}
							<th
								scope="col"
								class={`px-3 py-2 font-semibold ${i === 0 ? '' : 'text-right tabular-nums'}`}
							>
								{col}
							</th>
						{/each}
					</tr>
				</thead>
			{/if}
			<tbody>
				{#each table.rows as row, r (r)}
					<tr class="border-b border-border/60 align-top last:border-b-0">
						{#each row as cell, c (c)}
							<td
								class={`px-3 py-2 ${
									c === 0
										? 'font-medium text-foreground'
										: 'text-right tabular-nums text-muted-foreground'
								}`}
							>
								{formatCell(cell)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if table.notes.length > 0}
		<div class="mt-1.5 space-y-0.5">
			{#each table.notes as note, i (i)}
				<p class="text-[11px] text-muted-foreground/80 leading-4">
					{note}
				</p>
			{/each}
		</div>
	{/if}
</figure>
