<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Tick02Icon } from '@hugeicons/core-free-icons';
	import { MinusSignIcon } from '@hugeicons/core-free-icons';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		'border-border bg-card lip-static data-[state=checked]:bg-mint-strong data-[state=checked]:border-mint-strong data-[state=checked]:text-white data-[state=checked]:[--lip-color:color-mix(in_oklch,var(--mint-strong)_62%,black_38%)] aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex size-6 items-center justify-center rounded-sm border-2 transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	bind:checked
	bind:indeterminate
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<div
			data-slot="checkbox-indicator"
			class="[&>svg]:size-4 grid place-content-center text-current transition-none"
		>
			{#if checked}
				<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
			{:else if indeterminate}
				<HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
			{/if}
		</div>
	{/snippet}
</CheckboxPrimitive.Root>
