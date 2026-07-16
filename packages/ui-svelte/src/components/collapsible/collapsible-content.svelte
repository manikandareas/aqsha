<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CollapsiblePrimitive.ContentProps = $props();
</script>

<CollapsiblePrimitive.Content
	bind:ref
	data-slot="collapsible-content"
	class={cn(
		// Ease height between 0 and the measured content height (bits-ui sets
		// --bits-collapsible-content-height); overflow-hidden clips the inner content while it
		// collapses so an auto-close never snaps the surrounding transcript.
		'overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none',
		className
	)}
	{...restProps}
/>
