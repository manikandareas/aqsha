<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';
	import { Scrollbar } from './index.js';
	import { cn, type WithoutChild } from '../../utils.js';

	// Vignette sebagai OVERLAY (bukan mask) supaya bisa di-FADE saat hover dengan halus: dua gradient
	// warna `--background` (vertikal + horizontal) menutup konten di keempat tepi sementara tengah
	// transparan. Dipasang di Root (frame tetap), `pointer-events-none`; hilang halus saat Root di-hover.
	const VIGNETTE_OVERLAY =
		'linear-gradient(to bottom, var(--background), transparent 56px, transparent calc(100% - 56px), var(--background)), linear-gradient(to right, var(--background), transparent 56px, transparent calc(100% - 56px), var(--background))';

	let {
		ref = $bindable(null),
		viewportRef = $bindable(null),
		class: className,
		viewportClassName,
		vignette,
		orientation = 'vertical',
		scrollbarXClasses = '',
		scrollbarYClasses = '',
		children,
		...restProps
	}: WithoutChild<ScrollAreaPrimitive.RootProps> & {
		orientation?: 'vertical' | 'horizontal' | 'both' | undefined;
		scrollbarXClasses?: string | undefined;
		scrollbarYClasses?: string | undefined;
		viewportRef?: HTMLElement | null;
		viewportClassName?: string | undefined;
		vignette?: boolean;
	} = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	data-slot="scroll-area"
	class={cn('relative', vignette && 'group/scroll-vignette', className)}
	{...restProps}
>
	<ScrollAreaPrimitive.Viewport
		bind:ref={viewportRef}
		data-slot="scroll-area-viewport"
		class={cn(
			'focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1',
			viewportClassName
		)}
	>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	{#if vignette}
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity duration-300 ease-out group-hover/scroll-vignette:opacity-0"
			style="background: {VIGNETTE_OVERLAY}"
		></div>
	{/if}
	{#if orientation === 'vertical' || orientation === 'both'}
		<Scrollbar orientation="vertical" class={scrollbarYClasses} />
	{/if}
	{#if orientation === 'horizontal' || orientation === 'both'}
		<Scrollbar orientation="horizontal" class={scrollbarXClasses} />
	{/if}
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
