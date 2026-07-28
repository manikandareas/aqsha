<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { draw, scale } from 'svelte/transition';
	import { quartOut } from 'svelte/easing';
	import {
		buildStarfield,
		CONSTELLATION_VIEWBOX,
		constellationSegments,
		INTEREST_STARS
	} from '../../lib/journey-art';

	/**
	 * Interests illustration: the ~320M-works catalog as a starfield; each interest is a fixed
	 * star. Selecting a chip lights its star, and stars link into a constellation in selection
	 * order. Decorative — chips stay the semantic multi-select.
	 */
	let { selected, class: className = '' }: { selected: string[]; class?: string } = $props();

	const reduce = $derived(prefersReducedMotion.current);
	const chosen = $derived(new Set(selected));
	const segments = $derived(constellationSegments(selected));
	const field = buildStarfield(90, CONSTELLATION_VIEWBOX.width, CONSTELLATION_VIEWBOX.height);
	const starEntries = Object.entries(INTEREST_STARS);
</script>

<div class={className} aria-hidden="true">
	<svg
		viewBox="0 0 {CONSTELLATION_VIEWBOX.width} {CONSTELLATION_VIEWBOX.height}"
		fill="none"
		class="h-full w-full"
	>
		{#each field as fieldStar, i (i)}
			<circle
				cx={fieldStar.x}
				cy={fieldStar.y}
				r={fieldStar.r}
				fill="var(--muted-foreground)"
				opacity={fieldStar.o * 0.55}
			/>
		{/each}

		{#each segments as segment (segment.key)}
			<line
				x1={segment.x1}
				y1={segment.y1}
				x2={segment.x2}
				y2={segment.y2}
				stroke="var(--mint)"
				stroke-width="1.5"
				opacity="0.75"
				in:draw={reduce ? { duration: 0 } : { duration: 420, easing: quartOut }}
			/>
		{/each}

		{#each starEntries as [id, at] (id)}
			{#if chosen.has(id)}
				<g
					in:scale={reduce ? { duration: 0 } : { duration: 300, start: 0.3, easing: quartOut }}
					style="transform-origin: {at.x}px {at.y}px"
				>
					<circle cx={at.x} cy={at.y} r="9" fill="var(--mint)" opacity="0.18" />
					<path
						d="M{at.x} {at.y - 6.5} L{at.x + 1.6} {at.y - 1.6} L{at.x + 6.5} {at.y} L{at.x +
							1.6} {at.y + 1.6} L{at.x} {at.y + 6.5} L{at.x - 1.6} {at.y + 1.6} L{at.x -
							6.5} {at.y} L{at.x - 1.6} {at.y - 1.6} Z"
						fill="var(--mint)"
						stroke="var(--mint-strong)"
						stroke-width="1"
						stroke-linejoin="round"
					/>
				</g>
			{:else}
				<circle
					cx={at.x}
					cy={at.y}
					r="2.4"
					fill="var(--background)"
					stroke="var(--muted-foreground)"
					stroke-width="1.4"
					opacity="0.7"
				/>
			{/if}
		{/each}
	</svg>
</div>
