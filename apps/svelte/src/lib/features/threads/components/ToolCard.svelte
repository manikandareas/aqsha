<script lang="ts" module>
	/** Single shell class for every tool card above the composer (kept for `DeepRunNoticeCard`). */
	export const toolCardShellClass = 'rounded-xl border border-border bg-card p-3.5';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, ExpandIcon, type IconSvgElement } from '$lib/icons';
	import { cn } from '$lib/utils';

	/**
	 * Compact interactive tool card above the composer (Klarifikasi, Rencana riset, `/deep` notices, tool
	 * approvals). When `onOpenPanel` is given, the whole header becomes an open-panel button with an
	 * expand (⤢) affordance; otherwise a static header. Body (form / action row) follows.
	 */
	let {
		icon,
		title,
		meta,
		onOpenPanel,
		class: className,
		children
	}: {
		icon: IconSvgElement;
		title: string;
		meta?: string;
		onOpenPanel?: () => void;
		class?: string;
		children: Snippet;
	} = $props();
</script>

{#snippet heading()}
	<Icon {icon} class="size-4 shrink-0 text-muted-foreground" />
	<span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
		{title}
		{#if meta}<span class="ml-1.5 font-normal text-muted-foreground">· {meta}</span>{/if}
	</span>
{/snippet}

<div class={cn(toolCardShellClass, className)}>
	{#if onOpenPanel}
		<button
			type="button"
			onclick={onOpenPanel}
			title="Buka panel detail"
			class="group -m-1 flex w-full items-center gap-2 rounded-lg p-1 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{@render heading()}
			<Icon
				icon={ExpandIcon}
				class="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
			/>
		</button>
	{:else}
		<div class="flex items-center gap-2">{@render heading()}</div>
	{/if}
	<div class="mt-4">{@render children()}</div>
</div>
