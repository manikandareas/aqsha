<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { announcementContext } from './announcement.svelte';
	import { cn } from '$lib/utils';

	let {
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & { children?: Snippet } = $props();

	const { themed } = announcementContext.get();
</script>

<span
	class={cn(
		'-ml-2.5 shrink-0 truncate rounded-full bg-foreground/5 px-2.5 py-1 text-xs',
		themed && 'bg-background/60',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>
