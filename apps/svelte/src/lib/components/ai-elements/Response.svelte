<script lang="ts">
	import { untrack } from 'svelte';
	import { Streamdown } from 'svelte-streamdown';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { useSmoothText } from '$lib/features/threads/lib/smooth-text.svelte';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import { aqshaMarkdownExtensions } from './markdown-extensions';
	import { createNumberer, type StatsVizContextValue } from './contexts';
	import InlineCitation from './InlineCitation.svelte';
	import DeepVizFigure from './DeepVizFigure.svelte';
	import StatsVizFigure from './StatsVizFigure.svelte';

	// Svelte Streamdown adapter. Renders an Astra answer with custom-tag wiring: `[n]` citations,
	// `{{stats:}}` markers, and ```aqsha:viz fences → gated components.
	//
	// SANITIZE / SECURITY (NOT loosened): svelte-streamdown renders MARKED tokens, never raw HTML
	// (`renderHtml` left OFF), so `<script>`/`onerror`/`javascript:`-in-markup can't execute. Link/image
	// URLs are restricted to an explicit http(s)/mailto/relative allowlist → `javascript:` and `data:`
	// payloads are stripped. Custom tags are OUR tokens rendering OUR gated components (no HTML injection,
	// no sanitize allowlist widening).
	//
	// The rehype plugin pipeline is replaced by marked extensions + snippets (svelte-streamdown is
	// marked-based). Anti-forgery gates (viz + stats) are reactive snippet props because Svelte
	// `setContext` is init-only, but stats groups arrive post-stream.

	let {
		text,
		streaming = false,
		class: klass,
		citations,
		viz = false,
		statsGroups
	}: {
		text: string;
		/** Streaming this turn — exposed as `data-streaming` (CSS hook for smooth-reveal). */
		streaming?: boolean;
		class?: string;
		citations?: Map<number, SourceCardData[]>;
		/** True only for a trusted `/deep` report → arms the deep-viz gate. */
		viz?: boolean;
		/** Real `run_analysis` groups (DB) → arms the stats gate keyed by runKey. */
		statsGroups?: Map<string, StatsGroup>;
	} = $props();

	// Gate data — numberers are created ONCE per instance (stable document-order numbering that survives
	// re-render). `viz` is read once via `untrack` (a message is a /deep report or not — never flips
	// mid-life).
	const vizFigureAssign = untrack(() => (viz ? createNumberer() : undefined));
	const statsAssignTable = createNumberer();
	const statsAssignFigure = createNumberer();
	const statsValue = $derived<StatsVizContextValue | undefined>(
		statsGroups
			? { groups: statsGroups, assignTable: statsAssignTable, assignFigure: statsAssignFigure }
			: undefined
	);

	// Smooth character reveal while streaming; the full text shows at once once settled.
	// `parseIncompleteMarkdown` keeps half-formed markdown from flashing during the reveal.
	const smooth = useSmoothText(
		() => text,
		() => streaming
	);

	// `[data-streamdown]` wrapper → prose/table/citation styles apply as descendant selectors.
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
		content={smooth.current}
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
				<DeepVizFigure
					token={token as { payload?: string }}
					figureAssign={vizFigureAssign}
					{citations}
				/>
			{/if}
		{/snippet}
	</Streamdown>
</div>
