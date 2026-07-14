<script lang="ts">
	import { parseDeepVizBlock, type DeepVizBlock } from '@aqsha/chat-core/deep-viz';
	import type { VizFigureAssign } from './contexts';

	// `<deepviz payload>` gate — port of `DeepVizMarkdownComponent` / `viz-block.tsx`. ANTI-FORGERY:
	// the figure only renders when the `figureAssign` gate prop is present (a trusted `/deep` report; set
	// by `Response` only when `viz={true}`).
	//   1. no assigner (ordinary chat) → render the raw payload as PLAIN CODE (a forged fence never a figure).
	//   2. present, payload corrupt/unknown → compact fallback (not a crash), raw JSON in <details>.
	//   3. valid → the gated figure frame (figure number = block.figure ?? assign(block.id)).
	// The rich chart bodies (consensus meter, claims-evidence, …) are Phase 7 (THX-4); Phase 6 renders
	// the anti-forgery-gated frame + caption.

	let { token, figureAssign }: { token: { payload?: string }; figureAssign?: VizFigureAssign } =
		$props();

	const payload = $derived(typeof token.payload === 'string' ? token.payload : '');
	const assignFigure = $derived(figureAssign);
	const block = $derived<DeepVizBlock | null>(payload ? parseDeepVizBlock(payload) : null);

	// Human title per block type (mirror intent of web VIZ_TITLES; rich rendering = Phase 7).
	const TITLES: Record<string, string> = {
		'consensus-meter': 'Konsensus bukti',
		'results-timeline': 'Lini masa hasil',
		'top-contributors': 'Kontributor utama',
		'claims-evidence': 'Klaim & bukti',
		'gaps-matrix': 'Matriks celah',
		'open-questions': 'Pertanyaan terbuka'
	};
</script>

{#if !assignFigure}
	<!-- No provider → not a /deep report → plain code, never an official figure. -->
	<pre class="overflow-x-auto"><code>{payload}</code></pre>
{:else if !block}
	<!-- Provider present but corrupt/unknown → compact fallback (no crash). -->
	<div
		class="not-prose my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
	>
		<span>Visualisasi tidak dapat ditampilkan.</span>
		<details class="mt-1">
			<summary class="cursor-pointer">Data mentah</summary>
			<pre class="mt-1 overflow-x-auto text-[10px]"><code>{payload}</code></pre>
		</details>
	</div>
{:else}
	{@const figure = block.figure ?? assignFigure(block.id)}
	<svelte:boundary>
		<figure class="deep-viz not-prose my-4 rounded-xl border p-4">
			<div class="text-sm font-semibold">{TITLES[block.type] ?? 'Visualisasi bukti'}</div>
			<figcaption class="mt-2 text-xs text-muted-foreground">Gambar {figure}</figcaption>
		</figure>
		{#snippet failed()}
			<div
				class="not-prose my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
			>
				Visualisasi tidak dapat ditampilkan.
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
