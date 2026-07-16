<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.HeadCellProps = $props();
</script>

<CalendarPrimitive.HeadCell
	bind:ref
	class={cn(
		'text-muted-foreground w-(--cell-size) rounded-sm text-micro font-bold tracking-[0.05em] uppercase',
		className
	)}
	{...restProps}
/>
