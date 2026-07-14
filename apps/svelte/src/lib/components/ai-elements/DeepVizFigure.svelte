<script lang="ts">
	import { parseDeepVizBlock, type DeepVizBlock } from '@aqsha/chat-core/deep-viz';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import VizFigureBody from '$lib/features/threads/components/deep-viz/VizFigureBody.svelte';
	import type { VizFigureAssign } from './contexts';

	// `<deepviz payload>` gate — port of `DeepVizMarkdownComponent` / `viz-block.tsx`. ANTI-FORGERY:
	// the figure only renders when the `figureAssign` gate prop is present (a trusted `/deep` report; set
	// by `Response` only when `viz={true}`).
	//   1. no assigner (ordinary chat) → render the raw payload as PLAIN CODE (a forged fence never a figure).
	//   2. present, payload corrupt/unknown → compact fallback (not a crash), raw JSON in <details>.
	//   3. valid → the RICH gated figure (THX-4 `VizFigureBody`: consensus meter / timeline / claims / …),
	//      figure number = block.figure ?? assign(block.id). The citation map is threaded to PaperPills.
	// A per-block error boundary keeps one bad chart from tearing down the whole report.

	let {
		token,
		figureAssign,
		citations
	}: {
		token: { payload?: string };
		figureAssign?: VizFigureAssign;
		citations?: Map<number, SourceCardData[]>;
	} = $props();

	const payload = $derived(typeof token.payload === 'string' ? token.payload : '');
	const assignFigure = $derived(figureAssign);
	const block = $derived<DeepVizBlock | null>(payload ? parseDeepVizBlock(payload) : null);
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
		<VizFigureBody {figure} {block} {citations} />
		{#snippet failed()}
			<div
				class="not-prose my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-[12px] text-muted-foreground"
			>
				<p>Visual tidak dapat dimuat.</p>
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
