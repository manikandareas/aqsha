<script lang="ts">
	import type { StatsFigureBlock } from '@aqsha/chat-core/stats-viz';

	/**
	 * Figur PNG dari sandbox Daytona (scatterplot heteroskedastisitas, P-P plot, dsb.) — base64
	 * di-render langsung sebagai data-uri. Nomor "Gambar n" di-assign provider (urutan dokumen) — di
	 * web via React context `useStatsViz().assignFigure(block.id)`; di Svelte diteruskan sebagai prop
	 * `assignedNumber`. `max-w-full` + wrapper border supaya konsisten dengan tabel.
	 */
	let { block, assignedNumber }: { block: StatsFigureBlock; assignedNumber?: number } = $props();

	const number = $derived(block.figureNumber ?? assignedNumber ?? 0);
	const label = $derived(number > 0 ? `Gambar ${number}` : 'Gambar');
	const caption = $derived(block.caption?.trim());
</script>

<figure class="stats-viz my-5 min-w-0 not-prose">
	<div class="min-w-0 overflow-x-auto rounded-lg border bg-white p-2">
		<!-- Chart statis dari sandbox (bukan konten user) — alt deskriptif dari caption/label. -->
		<img
			src={`data:image/png;base64,${block.png}`}
			alt={caption || label}
			class="mx-auto block h-auto max-w-full"
		/>
	</div>
	<figcaption class="mt-2 flex min-w-0 items-baseline gap-2 text-[11px] leading-4">
		<span class="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
			{label}
		</span>
		{#if caption}
			<span class="min-w-0 text-muted-foreground">{caption}</span>
		{/if}
	</figcaption>
</figure>
