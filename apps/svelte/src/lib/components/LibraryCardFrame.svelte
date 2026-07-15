<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/**
	 * Layered library card shell. Hover choreography (3D tilt + fanned backing cards) uses
	 * `motion-safe:` CSS transitions so `prefers-reduced-motion` disables the animation.
	 */
	let {
		as = 'div',
		selected = false,
		children,
		class: className,
		contentClassName
	}: {
		as?: 'article' | 'div';
		selected?: boolean;
		children: Snippet;
		class?: string;
		contentClassName?: string;
	} = $props();
</script>

<svelte:element
	this={as}
	class={cn(
		'group relative aspect-[8/9] w-full min-w-0 min-h-[240px] @lg:min-h-[300px] rounded-[20px] [perspective:900px]',
		selected && 'ring-2 ring-primary/25',
		className
	)}
>
	<div
		class="pointer-events-none absolute inset-y-1 right-0 left-2 rounded-[18px] border border-border/85 bg-background opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-2 motion-safe:group-hover:opacity-100"
	></div>
	<div
		class="pointer-events-none absolute inset-y-2 right-0 left-3 rounded-[17px] border border-border/75 bg-card opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-3 motion-safe:group-hover:opacity-100"
	></div>
	<div
		class="pointer-events-none absolute inset-y-3 right-0 left-4 rounded-[16px] border border-border/65 bg-background opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:translate-x-4 motion-safe:group-hover:opacity-100"
	></div>
	<div
		class={cn(
			'relative z-[1] flex size-full min-h-0 flex-col overflow-hidden rounded-[20px] border bg-card shadow-none transition-[border-color,box-shadow] duration-150 ease-out motion-safe:transition-[border-color,box-shadow,transform] motion-safe:duration-200 motion-safe:group-hover:[transform:rotateY(-5deg)_rotateX(0.75deg)_translateY(-2px)]',
			selected ? 'border-primary/50' : 'border-border',
			contentClassName
		)}
	>
		<span
			class="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-border/60 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:group-hover:opacity-100"
		></span>
		{@render children()}
	</div>
</svelte:element>
