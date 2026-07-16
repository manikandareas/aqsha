<script lang="ts" module>
	export type Side = 'top' | 'right' | 'bottom' | 'left';
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import SheetPortal from './sheet-portal.svelte';
	import SheetOverlay from './sheet-overlay.svelte';
	import { Button } from '../button/index.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon } from '@hugeicons/core-free-icons';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		showCloseButton = true,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		side?: Side;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<SheetPortal {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		data-side={side}
		class={cn(
			'bg-popover text-popover-foreground fixed z-50 flex flex-col gap-5 bg-clip-padding p-[22px] transition duration-200 ease-in-out data-[side=bottom]:shadow-[0_-8px_24px_rgb(0_0_0/0.12)] data-[side=left]:shadow-[8px_0_24px_rgb(0_0_0/0.12)] data-[side=right]:shadow-[-8px_0_24px_rgb(0_0_0/0.12)] data-[side=top]:shadow-[0_8px_24px_rgb(0_0_0/0.12)] data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t-2 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r-2 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l-2 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b-2 data-[side=left]:sm:max-w-[360px] data-[side=right]:sm:max-w-[360px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:data-[state=open]:slide-in-from-bottom-10 data-[side=left]:data-[state=open]:slide-in-from-left-10 data-[side=right]:data-[state=open]:slide-in-from-right-10 data-[side=top]:data-[state=open]:slide-in-from-top-10 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:data-[state=closed]:slide-out-to-bottom-10 data-[side=left]:data-[state=closed]:slide-out-to-left-10 data-[side=right]:data-[state=closed]:slide-out-to-right-10 data-[side=top]:data-[state=closed]:slide-out-to-top-10',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close data-slot="sheet-close">
				{#snippet child({ props })}
					<Button variant="outline" class="absolute top-3 right-3" size="icon-sm" {...props}>
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
</SheetPortal>
