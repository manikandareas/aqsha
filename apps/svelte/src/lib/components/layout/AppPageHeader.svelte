<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, PanelLeftIcon } from '$lib/icons';
	import { appNavSidebarContext } from './app-nav-sidebar.svelte';
	import { panelHeaderBarClass } from './panel-surface';

	/**
	 * Page-owned chrome bar for `/app` product surfaces. Owns the left-nav sidebar trigger on
	 * mobile (and when the desktop rail is collapsed) so AppShell does not render a second header.
	 * Uses `appNavSidebarContext` so the trigger still works inside nested `DetailSplitLayout`
	 * providers.
	 */
	let {
		title,
		actions,
		mobileOnly = false,
		class: className
	}: {
		/** Optional — omit for trigger-only chrome (e.g. home keeps its hero as page content). */
		title?: Snippet;
		actions?: Snippet;
		/** When true, hide on `md+` so content pages keep their desktop hero/chrome. */
		mobileOnly?: boolean;
		class?: string;
	} = $props();

	const nav = appNavSidebarContext.get();
	const showTrigger = $derived(nav.isMobile || nav.state === 'collapsed');
</script>

<header class={cn(panelHeaderBarClass, mobileOnly && 'md:hidden', className)}>
	<div class="flex min-w-0 items-center gap-1.5">
		{#if showTrigger}
			<Button
				type="button"
				variant="ghost"
				class="-ml-1.5 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={() => nav.toggle()}
				aria-label="Buka sidebar kiri"
			>
				<Icon icon={PanelLeftIcon} class="size-3.5" />
			</Button>
		{/if}
		{#if title}
			{@render title()}
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>
	{/if}
</header>
