<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowRightIcon } from '@hugeicons/core-free-icons';
	import { calendarNavButtonClass } from '../../recipes.js';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CalendarPrimitive.NextButtonProps = $props();
</script>

{#snippet Fallback()}
	<HugeiconsIcon icon={ArrowRightIcon} strokeWidth={2} class="size-3.5" />
{/snippet}

<CalendarPrimitive.NextButton
	bind:ref
	class={cn(calendarNavButtonClass, className)}
	{...restProps}
>
	{#if children}
		{@render children?.()}
	{:else}
		{@render Fallback()}
	{/if}
</CalendarPrimitive.NextButton>
