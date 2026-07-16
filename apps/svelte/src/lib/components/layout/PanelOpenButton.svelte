<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Open affordance for a closed side panel — the pill on the page/main header. Hidden while
	 * the panel is open (closing lives on the panel's own close toggle). After opening, hands
	 * focus to the panel's `[data-panel-close]` toggle.
	 */
	let {
		open,
		onOpen,
		icon,
		label,
		ariaLabel
	}: {
		open: boolean;
		onOpen: () => void;
		icon: Snippet;
		/** Omit for the icon-only (circular) form. */
		label?: string;
		ariaLabel: string;
	} = $props();

	function focusPanelClose(attempt = 0) {
		if (document.activeElement !== document.body) return; // user moved on — don't steal
		const target = document.querySelector<HTMLElement>('[data-panel-close]');
		if (target) {
			target.focus();
			return;
		}
		if (attempt < 20) requestAnimationFrame(() => focusPanelClose(attempt + 1));
	}

	function handleClick() {
		onOpen();
		requestAnimationFrame(() => focusPanelClose());
	}
</script>

{#if !open}
	<button
		type="button"
		onclick={handleClick}
		aria-label={ariaLabel}
		class={cn(
			'flex shrink-0 items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
			label ? 'gap-1.5 px-2.5 py-1 text-[12px] font-semibold' : 'size-7 justify-center'
		)}
	>
		{@render icon()}
		{#if label}{label}{/if}
	</button>
{/if}
