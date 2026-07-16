<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';
	import type { ButtonSize } from '../button/index.js';
	let {
		ref = $bindable(null),
		class: className,
		size = 'icon',
		isActive,
		page,
		children,
		...restProps
	}: PaginationPrimitive.PageProps & {
		size?: ButtonSize;
		isActive: boolean;
	} = $props();
</script>

{#snippet Fallback()}
	{page.value}
{/snippet}

<PaginationPrimitive.Page
	bind:ref
	{page}
	aria-current={isActive ? 'page' : undefined}
	data-slot="pagination-link"
	data-active={isActive}
	data-size={size}
	class={cn(
		"inline-flex size-[34px] items-center justify-center gap-1 rounded-sm border-2 text-[0.82rem] whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
		isActive
			? 'border-transparent bg-primary font-bold text-primary-foreground shadow-[0_2px_0_0_color-mix(in_oklch,var(--primary)_60%,black_40%)]'
			: 'border-border text-muted-foreground bg-transparent font-medium hover:bg-muted',
		size === 'default' && 'w-auto px-3',
		'cn-pagination-link',
		className
	)}
	{...restProps}
>
	{#if children}
		{@render children?.()}
	{:else}
		{@render Fallback()}
	{/if}
</PaginationPrimitive.Page>
