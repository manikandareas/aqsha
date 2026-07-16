<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const alertVariants = tv({
		base: "alert-surface grid gap-0.5 rounded-lg px-[15px] py-[13px] text-left has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 group/alert relative w-full",
		variants: {
			variant: {
				default: 'text-card-foreground',
				mint: '[--alert-hue:var(--mint)] *:data-[slot=alert-title]:text-[color-mix(in_oklch,var(--foreground)_55%,var(--mint))]',
				lemon:
					'[--alert-hue:var(--lemon)] *:data-[slot=alert-title]:text-[color-mix(in_oklch,var(--foreground)_55%,var(--lemon))]',
				destructive:
					'[--alert-hue:var(--destructive)] text-foreground *:data-[slot=alert-title]:text-[color-mix(in_oklch,var(--foreground)_55%,var(--destructive))] *:[svg]:text-current'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
