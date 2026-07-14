<script lang="ts" module>
	export type PanelTab = {
		key: string;
		label: string;
		/** Non-navigable tab (upcoming feature) — rendered muted with the `hint` chip. */
		disabled?: boolean;
		/** Small hint after the label (e.g. "segera"). */
		hint?: string;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import PanelTitleLabel from './PanelTitleLabel.svelte';
	import { panelHeaderBarClass } from '$lib/panel-surface';
	import { cn } from '$lib/utils';

	/**
	 * Flush header bar that makes the side panel a HOME for several panels — a roving-tabindex
	 * tab strip on the left, panel actions on the right. Collapses to a plain title with ≤1
	 * usable tab. Padanan web `PanelTabsHeader`.
	 */
	let {
		tabs,
		activeKey,
		onSelect,
		actions
	}: {
		tabs: PanelTab[];
		activeKey: string | null;
		onSelect: (key: string) => void;
		actions?: Snippet;
	} = $props();

	const usableTabs = $derived(tabs.filter((tab) => !tab.disabled));
	const single = $derived(usableTabs.length <= 1);
	// Roving tabindex: the active tab is the strip's single tab stop; arrows move within.
	const focusKey = $derived(
		usableTabs.find((tab) => tab.key === activeKey)?.key ?? usableTabs[0]?.key
	);

	function handleTablistKeyDown(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		const container = event.currentTarget as HTMLElement;
		const tabEls = Array.from(
			container.querySelectorAll<HTMLElement>('[role="tab"]:not([aria-disabled="true"])')
		);
		if (tabEls.length === 0) return;
		const current = tabEls.indexOf(document.activeElement as HTMLElement);
		const next =
			event.key === 'ArrowRight'
				? (current + 1) % tabEls.length
				: event.key === 'ArrowLeft'
					? (current - 1 + tabEls.length) % tabEls.length
					: event.key === 'Home'
						? 0
						: tabEls.length - 1;
		event.preventDefault();
		tabEls[next]?.focus();
	}
</script>

<header class={panelHeaderBarClass}>
	{#if single}
		<div class="flex min-w-0 items-center gap-2">
			{#if usableTabs[0]}
				<PanelTitleLabel>{usableTabs[0].label}</PanelTitleLabel>
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div
			role="tablist"
			onkeydown={handleTablistKeyDown}
			class="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
		>
			{#each tabs as tab (tab.key)}
				{#if tab.disabled}
					<span
						role="tab"
						aria-disabled="true"
						aria-selected={false}
						class="flex shrink-0 cursor-default items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted-foreground/50"
					>
						{tab.label}
						{#if tab.hint}
							<span class="text-[10px] font-medium text-muted-foreground/50">{tab.hint}</span>
						{/if}
					</span>
				{:else}
					<button
						type="button"
						role="tab"
						aria-selected={tab.key === activeKey}
						tabindex={tab.key === focusKey ? 0 : -1}
						onclick={() => onSelect(tab.key)}
						class={cn(
							'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors',
							tab.key === activeKey
								? 'bg-primary/15 text-primary'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						)}
					>
						{tab.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
	{#if actions}
		<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>
	{/if}
</header>
