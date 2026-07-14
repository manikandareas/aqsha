<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	/**
	 * Brand loading spinner — ported 1:1 from apps/web/components/ui/flicker-spinner.tsx.
	 * A 7x7 LED-style dot grid that flickers a travelling pattern. Theme-aware — lit dots use
	 * `currentColor` (inherits `text-*`, works light + dark), resting dots are the same color
	 * dimmed. Size comes from `class` (e.g. `size-7`) or `size`. Respects reduced motion.
	 *
	 * The `.flicker-spinner` rules + `@keyframes` live GLOBALLY in styles/globals.css (web
	 * renders them as a `<style>` child of the SVG; a component `<style>` would scope the
	 * keyframe names away from the inline `style="animation: …"` references). Here we render
	 * only the SVG that references those global keyframes.
	 */
	let {
		class: className,
		size,
		...restProps
	}: SVGAttributes<SVGSVGElement> & { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 42 42"
	xmlns="http://www.w3.org/2000/svg"
	role="status"
	aria-label="Memuat"
	class={cn('flicker-spinner text-muted-foreground', className)}
	style="--dur: 2.400s"
	{...restProps}
>
	<circle cx="3" cy="3" r="2" />
	<circle cx="9" cy="3" r="2" />
	<circle cx="15" cy="3" r="2" />
	<circle cx="21" cy="3" r="2" />
	<circle cx="27" cy="3" r="2" />
	<circle cx="33" cy="3" r="2" />
	<circle cx="39" cy="3" r="2" />
	<circle cx="3" cy="9" r="2" />
	<circle cx="9" cy="9" r="2" />
	<circle cx="15" cy="9" r="2" />
	<circle
		class="on"
		cx="15"
		cy="9"
		r="2"
		opacity="1"
		style="animation: f1110000000000000 var(--dur) linear infinite"
	/>
	<circle cx="21" cy="9" r="2" />
	<circle
		class="on"
		cx="21"
		cy="9"
		r="2"
		opacity="0"
		style="animation: f0111000000000000 var(--dur) linear infinite"
	/>
	<circle cx="27" cy="9" r="2" />
	<circle
		class="on"
		cx="27"
		cy="9"
		r="2"
		opacity="0"
		style="animation: f0001100000000000 var(--dur) linear infinite"
	/>
	<circle cx="33" cy="9" r="2" />
	<circle cx="39" cy="9" r="2" />
	<circle cx="3" cy="15" r="2" />
	<circle cx="9" cy="15" r="2" />
	<circle
		class="on"
		cx="9"
		cy="15"
		r="2"
		opacity="1"
		style="animation: f1000000000000001 var(--dur) linear infinite"
	/>
	<circle cx="15" cy="15" r="2" />
	<circle
		class="on"
		cx="15"
		cy="15"
		r="2"
		opacity="0"
		style="animation: f0110000000000001 var(--dur) linear infinite"
	/>
	<circle cx="21" cy="15" r="2" />
	<circle
		class="on"
		cx="21"
		cy="15"
		r="2"
		opacity="1"
		style="animation: f1111100000000000 var(--dur) linear infinite"
	/>
	<circle cx="27" cy="15" r="2" />
	<circle
		class="on"
		cx="27"
		cy="15"
		r="2"
		opacity="0"
		style="animation: f0001011000000000 var(--dur) linear infinite"
	/>
	<circle cx="33" cy="15" r="2" />
	<circle
		class="on"
		cx="33"
		cy="15"
		r="2"
		opacity="0"
		style="animation: f0000111000000000 var(--dur) linear infinite"
	/>
	<circle cx="39" cy="15" r="2" />
	<circle cx="3" cy="21" r="2" />
	<circle cx="9" cy="21" r="2" />
	<circle
		class="on"
		cx="9"
		cy="21"
		r="2"
		opacity="0"
		style="animation: f0000000000000111 var(--dur) linear infinite"
	/>
	<circle cx="15" cy="21" r="2" />
	<circle
		class="on"
		cx="15"
		cy="21"
		r="2"
		opacity="1"
		style="animation: f1000000000001111 var(--dur) linear infinite"
	/>
	<circle cx="21" cy="21" r="2" />
	<circle cx="27" cy="21" r="2" />
	<circle
		class="on"
		cx="27"
		cy="21"
		r="2"
		opacity="0"
		style="animation: f0000111110000000 var(--dur) linear infinite"
	/>
	<circle cx="33" cy="21" r="2" />
	<circle
		class="on"
		cx="33"
		cy="21"
		r="2"
		opacity="0"
		style="animation: f0000011100000000 var(--dur) linear infinite"
	/>
	<circle cx="39" cy="21" r="2" />
	<circle cx="3" cy="27" r="2" />
	<circle cx="9" cy="27" r="2" />
	<circle
		class="on"
		cx="9"
		cy="27"
		r="2"
		opacity="0"
		style="animation: f0000000000001110 var(--dur) linear infinite"
	/>
	<circle cx="15" cy="27" r="2" />
	<circle
		class="on"
		cx="15"
		cy="27"
		r="2"
		opacity="0"
		style="animation: f0000000000010110 var(--dur) linear infinite"
	/>
	<circle cx="21" cy="27" r="2" />
	<circle
		class="on"
		cx="21"
		cy="27"
		r="2"
		opacity="0"
		style="animation: f0000000011111000 var(--dur) linear infinite"
	/>
	<circle cx="27" cy="27" r="2" />
	<circle
		class="on"
		cx="27"
		cy="27"
		r="2"
		opacity="0"
		style="animation: f0000000101100000 var(--dur) linear infinite"
	/>
	<circle cx="33" cy="27" r="2" />
	<circle
		class="on"
		cx="33"
		cy="27"
		r="2"
		opacity="0"
		style="animation: f0000000110000000 var(--dur) linear infinite"
	/>
	<circle cx="39" cy="27" r="2" />
	<circle cx="3" cy="33" r="2" />
	<circle cx="9" cy="33" r="2" />
	<circle cx="15" cy="33" r="2" />
	<circle
		class="on"
		cx="15"
		cy="33"
		r="2"
		opacity="0"
		style="animation: f0000000000011000 var(--dur) linear infinite"
	/>
	<circle cx="21" cy="33" r="2" />
	<circle
		class="on"
		cx="21"
		cy="33"
		r="2"
		opacity="0"
		style="animation: f0000000001110000 var(--dur) linear infinite"
	/>
	<circle cx="27" cy="33" r="2" />
	<circle
		class="on"
		cx="27"
		cy="33"
		r="2"
		opacity="0"
		style="animation: f0000000011100000 var(--dur) linear infinite"
	/>
	<circle cx="33" cy="33" r="2" />
	<circle cx="39" cy="33" r="2" />
	<circle cx="3" cy="39" r="2" />
	<circle cx="9" cy="39" r="2" />
	<circle cx="15" cy="39" r="2" />
	<circle cx="21" cy="39" r="2" />
	<circle cx="27" cy="39" r="2" />
	<circle cx="33" cy="39" r="2" />
	<circle cx="39" cy="39" r="2" />
</svg>
