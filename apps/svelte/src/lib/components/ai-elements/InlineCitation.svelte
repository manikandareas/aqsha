<script lang="ts">
	import { Icon, GlobeIcon } from '$lib/icons';
	import {
		parseCitationNumbers,
		resolveCitationCards
	} from '$lib/features/threads/lib/citation-markdown';
	import {
		faviconUrl,
		originMeta,
		sourceDomain,
		sourceHref
	} from '$lib/features/threads/lib/source-card';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';

	// `<citation>` → source pill. Port of `apps/web/components/ai-elements/inline-citation.tsx`
	// (`CitationMarkdownComponent` + `InlineCitation`). Rendered from the svelte-streamdown NATIVE
	// `inlineCitation` snippet, which passes the citation token (`{ keys, text }`). Resolves keys via
	// the citation `map` prop (passed down from `Response`); graceful degradation → the literal `[n]`
	// fallback text when the map is absent or unresolved.
	//
	// NOTE: the rich hover LinkPreview (microlink screenshot card) is a Phase 7 enhancement; Phase 6
	// renders the pill + a native `title`, preserving the link + `+N` affordance.

	let {
		token,
		map
	}: { token: { keys?: string[]; text?: string }; map?: Map<number, SourceCardData[]> } = $props();
	const numbers = $derived(parseCitationNumbers(token.keys ?? []));
	const cards = $derived(resolveCitationCards(numbers, map));
	const first = $derived(cards[0]);
	const domain = $derived(first ? sourceDomain(first) : null);
	const favicon = $derived(domain ? faviconUrl(domain) : null);
	const href = $derived(first ? sourceHref(first) : null);
	const extra = $derived(cards.length - 1);
	const label = $derived(first ? (domain ?? originMeta(first.origin).label) : '');

	const PILL =
		'mx-0.5 inline-flex max-w-[12rem] translate-y-px items-center gap-1 rounded-full border bg-muted/60 py-0.5 pr-1.5 pl-1 align-baseline font-medium text-[11px] text-muted-foreground leading-none no-underline transition-colors hover:bg-muted hover:text-foreground';
</script>

{#if cards.length === 0}
	{token.text ?? ''}
{:else}
	<a
		class={PILL}
		href={href ?? undefined}
		target={href ? '_blank' : undefined}
		rel={href ? 'noopener noreferrer' : undefined}
		title={first?.title}
	>
		{#if favicon}
			<img src={favicon} alt="" class="size-3.5 shrink-0 rounded-[3px]" />
		{:else}
			<Icon icon={GlobeIcon} class="size-3 shrink-0" />
		{/if}
		<span class="truncate">{label}</span>
		{#if extra > 0}
			<span class="text-muted-foreground/80 shrink-0 tabular-nums">+{extra}</span>
		{/if}
	</a>
{/if}
