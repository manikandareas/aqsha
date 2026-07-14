<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { HOME_EXPLORE_SECTION_ID } from './HomeExploreBento.svelte';

	/**
	 * "scroll ke bawah, yuk" handwritten cue — top-right of the /app landing, diagonal between the
	 * open-Workspace action and the hero title. Click → smooth-scroll to the Jelajahi section below the
	 * fold. Hidden below @2xl (no gap between header & hero on narrow screens). Port of
	 * `apps/web/features/thread-experience/components/explore-handwritten-cue.tsx` (framer-motion → CSS).
	 */
	const reduced = $derived(prefersReducedMotion.current);

	function scrollToExplore(): void {
		document.getElementById(HOME_EXPLORE_SECTION_ID)?.scrollIntoView({
			behavior: reduced ? 'auto' : 'smooth',
			block: 'start'
		});
	}
</script>

<button
	type="button"
	onclick={scrollToExplore}
	aria-label="Gulir ke section Jelajahi"
	class="group absolute top-12 right-8 z-10 hidden flex-row-reverse items-center gap-1.5 @2xl:flex"
>
	<span
		class="font-hand rotate-[5deg] text-[17px] text-muted-foreground transition-colors duration-150 ease-out group-hover:text-foreground"
	>
		scroll ke bawah, yuk
	</span>
	<!-- Note: do NOT add fill="none" here. In Tailwind v4 the `fill-*` utility lives in a CSS @layer,
	     while the presentation attribute `fill` wins over layered declarations → the arrow would inherit
	     fill:none (invisible). Colour is set via the `fill-*` class; the path inherits fill from the svg. -->
	<svg
		viewBox="0 0 219 41"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		class="shrink-0 fill-muted-foreground transition-colors duration-150 ease-out group-hover:fill-foreground"
		class:cue-pulse={!reduced}
		style="width: 42px"
	>
		<g clip-path="url(#clip0_home_cue)">
			<path
				d="M21.5 29.4C36.9 31.3 51.3 33.1 65.7 35C66.8 35.2 67.6 36.5 69.9 38.4C63.2 39.2 57.9 40.3 52.6 40.5C38.6 40.9 24.9 40.9 10.9 40.9C9.2 40.9 7.5 41.2 5.8 40.7C0.3 39.7 -1.6 36 1.4 31.1C2.9 28.8 4.6 26.7 6.5 24.7C13.7 17.5 21.1 10.4 28.5 3.4C29.7 2.1 31.6 1.5 34.2 0C34.6 10.9 23.8 13.9 21.5 22.4C23.4 22 25.1 21.8 26.6 21.3C83.7 5.5 140.6 7.3 197.3 22.6C203.2 24.1 208.9 26.4 214.6 28.6C217.6 29.6 220.1 32 218.5 35.6C217 39.2 214 39.2 210.6 37.7C172.8 20.7 132.6 18.8 91.9 19.4C70.8 19.6 50.1 22 29.5 26.9C27 27.5 24.5 28.4 21.5 29.4Z"
			/>
		</g>
		<defs>
			<clipPath id="clip0_home_cue">
				<rect width="219" height="41" />
			</clipPath>
		</defs>
	</svg>
</button>

<style>
	.cue-pulse {
		animation: cue-pulse 2.8s ease-in-out infinite;
	}
	@keyframes cue-pulse {
		0%,
		100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 0.65;
			transform: scale(1.08);
		}
	}
</style>
