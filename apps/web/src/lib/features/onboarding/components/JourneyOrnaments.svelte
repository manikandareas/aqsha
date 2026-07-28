<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { draw, fade } from 'svelte/transition';
	import { quartOut } from 'svelte/easing';
	import { Icon, SearchIcon } from '$lib/icons';
	import type { OnboardingStep } from '../lib/onboarding-machine';
	import { STEP_HAND_NOTE } from '../lib/onboarding-content';
	import Constellation from './art/Constellation.svelte';

	/**
	 * Margin doodles around the centered wizard — pencil marks on the field-notebook canvas, never
	 * content. Fully decorative (aria-hidden, pointer-events-none) and hidden below lg where the
	 * margins are too narrow. Ink follows the chapter accent via --journey-accent/-ink from the
	 * journey root; the top-right slot swaps per chapter (welcome = idea spark, interests = the
	 * live constellation, otherwise a hand arrow) so the margins tell the same story as the step.
	 */
	let { step, interests }: { step: OnboardingStep; interests: string[] } = $props();

	const reduce = $derived(prefersReducedMotion.current);
	const fadeIn = $derived(reduce ? { duration: 0 } : { duration: 260, delay: 120 });
	const fadeOut = $derived(reduce ? { duration: 0 } : { duration: 160 });
	const drawMain = $derived(reduce ? { duration: 0 } : { duration: 620, easing: quartOut });
	const drawTip = $derived(
		reduce ? { duration: 0 } : { duration: 200, delay: 580, easing: quartOut }
	);
</script>

<div class="pointer-events-none absolute inset-0 hidden select-none lg:block" aria-hidden="true">
	<!-- Top-left: starburst + the travelling hand note for the current chapter. -->
	<div class="absolute top-[26%] left-0 w-44 xl:left-2">
		<svg viewBox="0 0 40 40" fill="none" class="ml-7 size-9 rotate-6 ornament-ink">
			<g stroke-width="3" stroke-linecap="round" stroke="currentColor">
				<path d="M20 3.5 L20 12.5" />
				<path d="M31.5 8.5 L26.4 14.6" />
				<path d="M36.5 20.5 L28 20.2" />
				<path d="M31 31.5 L25.8 26" />
				<path d="M19.6 36.5 L20 28" />
				<path d="M8.6 31.6 L14.2 26.4" />
				<path d="M3.5 19.6 L12 20" />
				<path d="M8.2 8.8 L14 14.4" />
			</g>
		</svg>
		<div class="mt-2 grid">
			{#key step}
				<p
					class="font-hand -rotate-3 text-2xl leading-tight [grid-area:1/1] ornament-note"
					in:fade={fadeIn}
					out:fade={fadeOut}
				>
					{STEP_HAND_NOTE[step]}
				</p>
			{/key}
		</div>
	</div>

	<!-- Top-right slot: the chapter's own doodle. One `{#key step}` remounts draw animations. -->
	<div class="absolute top-[15%] right-0 grid w-56 justify-items-end xl:w-72">
		{#key step}
			<div class="w-full [grid-area:1/1]" in:fade={fadeIn} out:fade={fadeOut}>
				{#if step === 'welcome'}
					<!-- Compact tangle-to-spark: the raw idea resolving into a direction. -->
					<svg viewBox="0 0 130 96" fill="none" class="ml-auto h-24 w-32 ornament-accent">
						<path
							d="M8 78 C 18 52, 44 46, 40 64 C 37 78, 16 76, 24 58 C 34 36, 64 32, 90 27"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							in:draw={drawMain}
						/>
						<path
							d="M79 17 L93 26 L81 37"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							in:draw={drawTip}
						/>
						<path
							d="M112 4 L114.8 12.2 L123 15 L114.8 17.8 L112 26 L109.2 17.8 L101 15 L109.2 12.2 Z"
							fill="currentColor"
							stroke-linejoin="round"
						/>
					</svg>
				{:else if step === 'interests'}
					<Constellation selected={interests} class="h-56 w-full" />
				{:else}
					<svg viewBox="0 0 90 110" fill="none" class="ml-auto h-28 w-24 ornament-accent">
						<path
							d="M12 103 C 52 98, 76 66, 65 13"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							in:draw={drawMain}
						/>
						<path
							d="M51 26 L64 8 L74 28"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							in:draw={drawTip}
						/>
					</svg>
				{/if}
			</div>
		{/key}
	</div>

	<!-- Bottom-left: a loose swoosh pointing back toward the action row. -->
	<svg
		viewBox="0 0 160 60"
		fill="none"
		class="absolute bottom-[17%] left-[3%] h-14 w-40 ornament-accent"
	>
		<path
			d="M6 42 C 38 57, 96 51, 146 22"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
		/>
		<path
			d="M131 16 L149 20 L139 34"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>

	<!-- Bottom-right: a search-pill sticker slapped on the desk, Aqsha's own note. -->
	<div class="absolute right-[2%] bottom-[13%] -rotate-4">
		<svg viewBox="0 0 32 32" fill="none" class="absolute -top-4 -right-3 size-8 text-lavender">
			<g stroke-width="2.5" stroke-linecap="round" stroke="currentColor">
				<path d="M16 3 L16 10" />
				<path d="M25.5 6.5 L21.4 12" />
				<path d="M29 16 L22 16" />
				<path d="M25.5 25.5 L21 21" />
				<path d="M16 29 L16 22" />
				<path d="M6.5 25.5 L11 21" />
				<path d="M3 16 L10 16" />
				<path d="M6.5 6.5 L11 11.4" />
			</g>
		</svg>
		<div
			class="lip-static flex items-center gap-2.5 rounded-full border-2 border-border bg-card py-2 pr-5 pl-4"
		>
			<Icon icon={SearchIcon} class="size-4 shrink-0 text-muted-foreground" />
			<span class="font-hand text-xl leading-none text-foreground">mari susun risetmu bersama!</span
			>
		</div>
	</div>
</div>

<style>
	.ornament-accent {
		color: var(--journey-accent, var(--border));
		transition: color 320ms;
	}
	.ornament-ink {
		color: var(--journey-accent-ink, var(--muted-foreground));
		transition: color 320ms;
	}
	.ornament-note {
		color: var(--journey-accent-ink, var(--muted-foreground));
	}
	@media (prefers-reduced-motion: reduce) {
		.ornament-accent,
		.ornament-ink {
			transition: none;
		}
	}
</style>
