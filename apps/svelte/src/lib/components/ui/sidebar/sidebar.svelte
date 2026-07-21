<script lang="ts" module>
	// Aqsha adds `flush` + `transparent` on top of the stock sidebar/floating/inset
	// variants: transparent = a docked rail over the app background (no border, no bg),
	// rail over the app background (no border, no bg), flush = opaque app-background rail.
	export type SidebarVariant = 'sidebar' | 'floating' | 'inset' | 'flush' | 'transparent';

	function sidebarSurfaceClass(variant: SidebarVariant): string {
		if (variant === 'transparent') return 'bg-transparent';
		if (variant === 'flush') return 'bg-background';
		return 'bg-sidebar';
	}
</script>

<script lang="ts">
	import * as Sheet from '@aqsha/ui-svelte/components/sheet';
	import { cn, type WithElementRef } from '@aqsha/ui-svelte/utils';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SIDEBAR_WIDTH_MOBILE } from './constants.js';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: 'left' | 'right';
		variant?: SidebarVariant;
		collapsible?: 'offcanvas' | 'icon' | 'none';
	} = $props();

	const sidebar = useSidebar();
</script>

{#if collapsible === 'none'}
	<div
		class={cn(
			'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else if sidebar.isMobile}
	<Sheet.Root bind:open={() => sidebar.openMobile, (v) => sidebar.setOpenMobile(v)} {...restProps}>
		<Sheet.Content
			bind:ref
			data-sidebar="sidebar"
			data-slot="sidebar"
			data-mobile="true"
			class={cn(
				'text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden',
				// The offcanvas sheet floats over page content, so "transparent" (meant for
				// a docked rail over the app background) must fall back to an opaque surface.
				variant === 'transparent' ? 'bg-sidebar' : sidebarSurfaceClass(variant),
				className
			)}
			style="--sidebar-width: {SIDEBAR_WIDTH_MOBILE};"
			{side}
		>
			<Sheet.Header class="sr-only">
				<Sheet.Title>Sidebar</Sheet.Title>
				<Sheet.Description>Displays the mobile sidebar.</Sheet.Description>
			</Sheet.Header>
			<div class="flex h-full w-full flex-col">
				{@render children?.()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<div
		bind:this={ref}
		class="text-sidebar-foreground group peer hidden md:block"
		data-state={sidebar.state}
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		<!-- This is what handles the sidebar gap on desktop -->
		<div
			data-slot="sidebar-gap"
			class={cn(
				'transition-[width] duration-200 ease-linear relative w-(--sidebar-width)',
				variant === 'flush' ? 'bg-background' : 'bg-transparent',
				'group-data-[collapsible=offcanvas]:w-0',
				'group-data-[side=right]:rotate-180',
				variant === 'floating' || variant === 'inset'
					? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(1)))]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
			)}
		></div>
		<div
			data-slot="sidebar-container"
			class={cn(
				'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
				side === 'left'
					? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
					: 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
				// Adjust the padding for floating and inset variants.
				variant === 'floating' || variant === 'inset'
					? 'p-2 group-data-[collapsible=icon]:p-0.5 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(1))+2px)]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
				variant === 'sidebar' && 'group-data-[side=left]:border-e group-data-[side=right]:border-s',
				className
			)}
			{...restProps}
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class={cn(
					'group-data-[variant=floating]:ring-sidebar-border group-data-[variant=floating]:rounded-xl group-data-[variant=floating]:ring-1 flex size-full flex-col',
					sidebarSurfaceClass(variant)
				)}
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
