<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	// Two families share one primitive: quiet metadata badges (h-5, sentence case) and the
	// loud `chip-*` tokens (h-6, solid `-strong` faces carrying white uppercase text in both
	// modes; lavender is the mono /command token, lemon rides a light face with its own ink).
	// `eyebrow` is a quiet outline label for section markers — still sentence case.
	const chip =
		'h-6 border-transparent px-[11px] text-label font-extrabold tracking-[0.04em] text-white uppercase';

	export const badgeVariants = tv({
		base: 'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				destructive:
					'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
				outline:
					'border-2 border-border bg-card text-muted-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				eyebrow:
					'border-border h-auto border-2 bg-transparent px-3 py-1 font-semibold text-muted-foreground',
				ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
				'chip-mint': `${chip} bg-mint-strong [a]:hover:brightness-106`,
				'chip-lavender': `${chip} bg-lavender-strong font-mono font-bold tracking-normal normal-case [a]:hover:brightness-106`,
				'chip-coral': `${chip} bg-coral-strong [a]:hover:brightness-106`,
				'chip-lemon': `${chip} bg-[color-mix(in_oklch,var(--lemon)_65%,white)] text-lemon-chip-ink [a]:hover:brightness-103`
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	bind:this={ref}
	data-slot="badge"
	data-variant={variant}
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
