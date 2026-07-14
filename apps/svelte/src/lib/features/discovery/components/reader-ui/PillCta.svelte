<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, ArrowUpRightIcon } from '$lib/icons';
	import { cn } from '$lib/utils';

	// Easing fisik (spring-out) dipakai konsisten untuk semua transisi interaktif.
	const EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

	/**
	 * CTA pill dengan ikon bersarang (button-in-button). `solid` = high-contrast ink,
	 * `outline` = hairline. Hover: ikon menggeser diagonal + press scale — kinetik halus.
	 * `bareIcon` melepas cangkang lingkaran ikon (mis. untuk menyematkan duo avatar Astra).
	 */
	let {
		href,
		onClick,
		variant = 'solid',
		icon,
		bareIcon,
		children
	}: {
		href?: string;
		onClick?: () => void;
		variant?: 'solid' | 'outline';
		icon?: Snippet;
		bareIcon?: boolean;
		children: Snippet;
	} = $props();

	const solid = $derived(variant === 'solid');
	const base = $derived(
		cn(
			'group inline-flex items-center gap-2.5 rounded-full py-1.5 pl-5 pr-1.5 text-[13px] font-semibold transition-[transform,background-color,color] duration-300 active:scale-[0.98]',
			EASE,
			solid
				? 'bg-foreground text-background hover:bg-foreground/90'
				: 'border border-border/80 bg-card text-foreground hover:border-foreground/30 hover:bg-muted/40'
		)
	);
	const iconWrap = $derived(
		cn(
			'flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-px',
			EASE,
			!bareIcon && 'size-7 rounded-full',
			!bareIcon && (solid ? 'bg-background/15' : 'bg-muted')
		)
	);
</script>

{#snippet inner()}
	<span>{@render children()}</span>
	<span class={iconWrap}>
		{#if icon}{@render icon()}{:else}<Icon icon={ArrowUpRightIcon} class="size-4" />{/if}
	</span>
{/snippet}

{#if href}
	<a {href} target="_blank" rel="noopener noreferrer" class={base}>
		{@render inner()}
	</a>
{:else}
	<button type="button" onclick={onClick} class={base}>
		{@render inner()}
	</button>
{/if}
