<script lang="ts">
	import { untrack } from 'svelte';
	import { Streamdown } from 'svelte-streamdown';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { cn } from '$lib/utils';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import { aqshaMarkdownExtensions } from './markdown-extensions';
	import { createNumberer, type StatsVizContextValue } from './contexts';
	import InlineCitation from './InlineCitation.svelte';
	import DeepVizFigure from './DeepVizFigure.svelte';
	import StatsVizFigure from './StatsVizFigure.svelte';

	// THC-6 — the Svelte Streamdown adapter (DEALBREAKER). Port of `apps/web/components/ai-elements/
	// response.tsx` + `message.tsx` `MessageResponse`. Renders an Astra answer with the custom-tag
	// wiring: `[n]` citations, `{{stats:}}` markers, and ```aqsha:viz fences → gated components.
	//
	// SANITIZE / SECURITY (NOT loosened, §10 gate): svelte-streamdown renders MARKED tokens, never raw
	// HTML (`renderHtml` left OFF), so `<script>`/`onerror`/`javascript:`-in-markup can't execute.
	// Link/image URLs are restricted to an explicit http(s)/mailto/relative allowlist → `javascript:`
	// and `data:` payloads are stripped. Our custom tags are OUR tokens rendering OUR gated components
	// (no HTML injection, no sanitize allowlist widening). Pinned by `response.svelte.spec.ts` (XSS corpus).
	//
	// DIVERGENCE FROM WEB: the rehype `reportRehypePlugins` pipeline is replaced by marked extensions +
	// snippets (svelte-streamdown is marked-based). The anti-forgery gates (VizFigureProvider /
	// StatsBlocksProvider) are ported as REACTIVE snippet props (Svelte `setContext` is init-only, but
	// stats groups arrive post-stream). Presence-of-gate-data semantics are identical. See the Phase 6
	// decision record + §13 risk register.

	let {
		text,
		streaming = false,
		class: klass,
		citations,
		viz = false,
		statsGroups
	}: {
		text: string;
		/** Streaming this turn — exposed as `data-streaming` (CSS hook; Phase 7 adds smooth-reveal). */
		streaming?: boolean;
		class?: string;
		citations?: Map<number, SourceCardData[]>;
		/** True only for a trusted `/deep` report → arms the deep-viz gate. */
		viz?: boolean;
		/** Real `run_analysis` groups (DB) → arms the stats gate keyed by runKey. */
		statsGroups?: Map<string, StatsGroup>;
	} = $props();

	// Gate data — mirror of the React providers. Numberers are created ONCE per instance (stable
	// document-order numbering that survives re-render), matching `useRef(new Map)` in the web providers.
	// `viz` is read once via `untrack` (a message is a /deep report or not — never flips mid-life).
	const vizFigureAssign = untrack(() => (viz ? createNumberer() : undefined));
	const statsAssignTable = createNumberer();
	const statsAssignFigure = createNumberer();
	const statsValue = $derived<StatsVizContextValue | undefined>(
		statsGroups
			? { groups: statsGroups, assignTable: statsAssignTable, assignFigure: statsAssignFigure }
			: undefined
	);

	// `[data-streamdown]` wrapper → the Phase 3 golden CSS (prose/table/citation) applies as descendant
	// selectors (§9.1 point 4). Web `MessageResponse` classes preserved.
	const WRAP = $derived(
		cn(
			'aqsha-prose aqsha-prose-message size-full min-w-0 max-w-full overflow-x-hidden break-words',
			'[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
			klass
		)
	);
</script>

<div data-streamdown data-streaming={streaming || undefined} class={WRAP}>
	<Streamdown
		content={text}
		baseTheme="shadcn"
		parseIncompleteMarkdown={true}
		allowedLinkPrefixes={['https://', 'http://', 'mailto:', '/']}
		allowedImagePrefixes={['https://', 'http://', '/']}
		extensions={aqshaMarkdownExtensions}
	>
		{#snippet inlineCitation({ token })}
			<InlineCitation {token} map={citations} />
		{/snippet}
		{#snippet children({ token })}
			{#if token.type === 'aqsha-stats'}
				<StatsVizFigure token={token as { runKey?: string }} stats={statsValue} />
			{:else if token.type === 'aqsha-viz'}
				<DeepVizFigure token={token as { payload?: string }} figureAssign={vizFigureAssign} />
			{/if}
		{/snippet}
	</Streamdown>
</div>
