<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, type IconSvgElement } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	let {
		icon,
		tone = 'accent',
		children
	}: {
		icon?: IconSvgElement;
		tone?: 'accent' | 'muted';
		children: Snippet;
	} = $props();
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
		tone === 'accent' ? 'bg-sky-soft text-sky-foreground' : 'bg-muted text-muted-foreground'
	)}
>
	{#if icon}<Icon {icon} class="size-2.5" />{/if}
	{@render children()}
</span>
