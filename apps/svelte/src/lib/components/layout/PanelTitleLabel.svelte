<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/** Plain panel title label — ported from apps/web/components/panel-title-dropdown-trigger.tsx
	 *  (`PanelTitleLabel`). The richer dropdown-trigger variant is ported with its consumer (Phase 7). */
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<span class={cn('truncate text-[12px] font-normal leading-snug text-foreground', className)}>
	{@render children()}
</span>
