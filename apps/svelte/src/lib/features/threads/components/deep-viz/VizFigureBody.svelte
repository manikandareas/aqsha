<script lang="ts">
	import type { DeepVizBlock } from '@aqsha/chat-core/deep-viz';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import ClaimsEvidence from './ClaimsEvidence.svelte';
	import ConsensusMeter from './ConsensusMeter.svelte';
	import GapsMatrix from './GapsMatrix.svelte';
	import OpenQuestions from './OpenQuestions.svelte';
	import ResultsTimeline from './ResultsTimeline.svelte';
	import TopContributors from './TopContributors.svelte';

	/**
	 * Frame figur ala artikel ilmiah (referensi Consensus): judul tebal di atas, konten flush
	 * (tanpa kotak card — hairline dibawa masing-masing blok), caption "Gambar n" + deskripsi
	 * kecil di bawah. Port `VizFigure` + `VizBlockBody` dari `viz-block.tsx`. Peta sitasi
	 * diteruskan ke blok yang butuh (timeline, kontributor, klaim) sebagai prop `citations`.
	 */

	/** Judul seksi di ATAS konten (ala Consensus) — meter konsensus tanpa judul generik
	 * (pertanyaannya sendiri yang jadi judul). */
	const VIZ_TITLES: Partial<Record<DeepVizBlock['type'], string>> = {
		'results-timeline': 'Timeline publikasi',
		'top-contributors': 'Kontributor teratas',
		'claims-evidence': 'Tabel klaim & bukti',
		'gaps-matrix': 'Celah riset',
		'open-questions': 'Pertanyaan riset terbuka'
	};

	/** Deskripsi caption "Gambar n" di BAWAH konten (sentence case, jujur soal metode). */
	function vizCaption(block: DeepVizBlock): string {
		switch (block.type) {
			case 'consensus-meter':
				return `Sebaran temuan ${block.n} paper terhadap sub-pertanyaan; klasifikasi berdasar judul + abstrak/snippet (bukan teks penuh).`;
			case 'results-timeline':
				return 'Timeline publikasi paper yang disertakan; marker lebih besar = lebih banyak sitasi.';
			case 'top-contributors':
				return 'Author & jurnal yang paling sering muncul pada paper yang disertakan.';
			case 'claims-evidence':
				return 'Klaim kunci beserta kekuatan bukti pendukung yang teridentifikasi dari paper.';
			case 'gaps-matrix':
				return 'Jumlah studi per topik/outcome dan desain studi; sel kosong = celah riset.';
			case 'open-questions':
				return 'Pertanyaan terbuka yang menyoroti arah riset selanjutnya.';
		}
	}

	let {
		figure,
		block,
		citations
	}: { figure: number; block: DeepVizBlock; citations?: Map<number, SourceCardData[]> } = $props();

	const label = $derived(Number.isFinite(figure) && figure > 0 ? `Gambar ${figure}` : 'Gambar');
	const title = $derived(VIZ_TITLES[block.type]);
</script>

<figure class="deep-viz my-6 min-w-0 not-prose">
	{#if title}
		<p class="mb-3 font-semibold text-[15px] text-foreground leading-6">{title}</p>
	{/if}
	{#if block.type === 'consensus-meter'}
		<ConsensusMeter {block} />
	{:else if block.type === 'results-timeline'}
		<ResultsTimeline {block} {citations} />
	{:else if block.type === 'top-contributors'}
		<TopContributors {block} {citations} />
	{:else if block.type === 'claims-evidence'}
		<ClaimsEvidence {block} {citations} />
	{:else if block.type === 'gaps-matrix'}
		<GapsMatrix {block} />
	{:else if block.type === 'open-questions'}
		<OpenQuestions {block} />
	{/if}
	<figcaption class="mt-3 flex min-w-0 items-baseline gap-2 text-[11px] leading-4">
		<span class="shrink-0 font-medium font-mono text-muted-foreground/80 tracking-wide">
			{label}
		</span>
		<span class="min-w-0 text-muted-foreground">{vizCaption(block)}</span>
	</figcaption>
</figure>
