<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * A capped preview of expandable step content that opens the full thing in the side
	 * detail panel instead of scrolling inline. The preview is non-interactive; hover/focus
	 * raises a flat paper veil with the "Klik untuk detail" label — a "there's more, click"
	 * cue — and clicking anywhere opens the panel.
	 * Replaces the inline `ScrollArea` for plan / search / verify / counter-evidence steps.
	 *
	 * Uses `role="button"` on a div (not a `<button>`) because the preview may contain
	 * anchors (source cards), which are illegal inside a button. The preview uses `inert`
	 * (not just `pointer-events-none`): inert removes its descendants from the tab order
	 * AND hides them from assistive tech, so a keyboard user can't land focus on (and Enter
	 * to navigate) a source `<a>` inside the preview instead of opening the panel.
	 * Falls back to a capped, scrollable preview when no opener is provided (compact chat
	 * panels, no detail slot) — keeping long tool output bounded there too.
	 */
	let {
		onOpen,
		label = 'Klik untuk detail',
		maxHeightClass = 'max-h-[140px]',
		class: className,
		children
	}: {
		onOpen?: () => void;
		label?: string;
		maxHeightClass?: string;
		class?: string;
		children: Snippet;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onOpen?.();
		}
	}
</script>

{#if !onOpen}
	<!-- No detail slot (compact chat panels) → no panel to expand to, but still cap the
	     height with an inline scroll so long tool output doesn't push the transcript down. -->
	<div
		class={cn(
			'overflow-y-auto rounded-lg border-2 border-border bg-background',
			maxHeightClass,
			className
		)}
	>
		{@render children()}
	</div>
{:else}
	<div
		role="button"
		tabindex={0}
		onclick={onOpen}
		onkeydown={onKeydown}
		class={cn(
			'group relative cursor-pointer overflow-hidden rounded-lg border-2 border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			className
		)}
	>
		<div class={cn('overflow-hidden', maxHeightClass)} inert aria-hidden="true">
			{@render children()}
		</div>
		<!-- Veil datar: muncul penuh saat hover/focus supaya label CTA terbaca; tanpa gradient/blur. -->
		<div
			class="pointer-events-none absolute inset-0 bg-background/80 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
		></div>
		<span
			class="pointer-events-none absolute inset-0 flex items-center justify-center text-label font-medium text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
		>
			{label}
		</span>
	</div>
{/if}
