<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner/index.js';

	/**
	 * Canonical loading spinner. Renders the brand `FlickerSpinner` (theme-aware dot-grid; respects
	 * reduced-motion): color follows the `text-*` class via currentColor, size
	 * follows the `size-*` class (default `size-4`). Rest props (e.g. `data-icon`
	 * for button spacing) flow through to the SVG.
	 */
	let { class: className, ...restProps }: SVGAttributes<SVGSVGElement> = $props();
</script>

<FlickerSpinner class={cn('size-4', className)} {...restProps} />
