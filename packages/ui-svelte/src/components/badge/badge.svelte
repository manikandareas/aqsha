<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	// Quiet metadata and loud chips share the button face language (border-2,
	// rounded-sm, filled/outline/tonal gradients) at a tighter control height.
	const chip =
		'h-6 border-transparent px-2.5 text-label font-extrabold text-white btn-filled-gradient';

	export const badgeVariants = tv({
		base: "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border-2 border-transparent bg-clip-padding px-2.5 text-xs font-bold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground btn-filled-gradient [--btn-face:var(--primary)] [a]:hover:brightness-106',
				secondary:
					'bg-secondary text-secondary-foreground btn-filled-gradient [--btn-face:var(--secondary)] [a]:hover:brightness-106',
				destructive:
					'text-destructive border-[color-mix(in_oklch,var(--destructive)_35%,transparent)] btn-tonal-gradient [--btn-tint:var(--destructive)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:brightness-106',
				outline:
					'border-border bg-background text-muted-foreground btn-outline-gradient [a]:hover:text-foreground',
				eyebrow:
					'border-border h-auto bg-transparent px-3 py-1 font-semibold text-muted-foreground btn-outline-gradient',
				ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
				'chip-mint': `${chip} bg-mint-strong [--btn-face:var(--mint-strong)] [a]:hover:brightness-106`,
				'chip-lavender': `${chip} bg-lavender-strong font-mono font-bold tracking-normal normal-case [--btn-face:var(--lavender-strong)] [a]:hover:brightness-106`,
				'chip-coral': `${chip} bg-coral-strong [--btn-face:var(--coral-strong)] [a]:hover:brightness-106`,
				'chip-lemon': `${chip} bg-[color-mix(in_oklch,var(--lemon)_65%,white)] text-lemon-chip-ink [--btn-face:color-mix(in_oklch,var(--lemon)_65%,white)] [a]:hover:brightness-103`
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
