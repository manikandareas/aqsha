<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade, fly, scale } from 'svelte/transition';
	import { Icon, FlagIcon } from '$lib/icons';
	import { INTEREST_STAR_GLYPH } from '../lib/journey-art';
	import { buildFinishReflection, ONBOARDING_COPY } from '../lib/onboarding-content';
	import type { OnboardingAnswers } from '../lib/onboarding-machine';

	let { answers }: { answers: OnboardingAnswers } = $props();

	const copy = ONBOARDING_COPY.finish;
	const reflection = $derived(buildFinishReflection(answers));
	const reduce = $derived(prefersReducedMotion.current);
</script>

<!-- Finish chapter: reflection line + Einstein send-off. flex-1 + mt-auto parks the figure on the
     action row; -mb-8 cancels the shell's bottom padding so the cut-off stands on the buttons. -->
<section class="flex min-h-0 flex-1 flex-col text-center">
	<div class="stagger" style="--stagger-duration: 460ms; --stagger-step: 70ms">
		<div style="--i: 0">
			<h1
				data-onboarding-heading
				tabindex="-1"
				class="font-heading mx-auto max-w-2xl text-3xl leading-[1.1] font-normal tracking-tight text-balance text-foreground outline-none sm:text-4xl"
			>
				{copy.title}
			</h1>
		</div>
		<div style="--i: 1">
			<p class="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
				{copy.description}
			</p>
		</div>
		<div style="--i: 2">
			<div class="mx-auto mt-9 flex max-w-lg flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
				{#if reflection.backgroundLabel}
					<span class="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
						<Icon icon={FlagIcon} class="size-4 shrink-0 text-coral" aria-hidden="true" />
						{reflection.backgroundLabel}
					</span>
					<svg viewBox="0 0 36 16" fill="none" aria-hidden="true" class="h-4 w-9 text-border">
						<path
							d="M2 10 C 10 4, 20 14, 30 7"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
						<path
							d="M24 3 L32 6.5 L26 13"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{/if}
				{#each reflection.visibleInterestLabels as label (label)}
					<span
						class="inline-flex items-center gap-1.5 rounded-full border-2 border-mint-soft-border bg-mint-soft px-3 py-1 text-sm font-medium text-mint-foreground"
					>
						<svg viewBox="0 0 12 12" aria-hidden="true" class="size-3 shrink-0">
							<path d={INTEREST_STAR_GLYPH} fill="var(--mint)" stroke-linejoin="round" />
						</svg>
						{label}
					</span>
				{/each}
				{#if reflection.remainingInterestCount > 0}
					<span class="text-sm font-medium text-muted-foreground">
						+{reflection.remainingInterestCount} bidang lain
					</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Einstein sticks his tongue out over the action row — the send-off wink. The thought bubble
	     is real text (hand-drawn blob + Caveat), floating up-left. -->
	<div
		class="pointer-events-none relative mt-auto -mb-8 ml-auto w-64 select-none sm:w-72 lg:w-80"
		in:fly={reduce ? { duration: 0 } : { y: 14, duration: 420, delay: 260 }}
	>
		<div
			class="bubble absolute top-[12%] right-[72%] z-10 w-[78%] -rotate-3 border-2 border-border bg-card px-3.5 py-2.5 text-center sm:px-4 sm:py-3"
			in:scale={reduce ? { duration: 0 } : { duration: 260, delay: 560, start: 0.8 }}
		>
			<p class="font-hand text-lg leading-snug text-foreground">
				Imagination is more important than knowledge.
			</p>
			<p class="font-hand mt-0.5 text-sm text-muted-foreground">— Albert Einstein</p>
		</div>
		<!-- Dashed hand arrow: the thought points back at its thinker. -->
		<svg
			viewBox="0 0 90 60"
			fill="none"
			aria-hidden="true"
			class="absolute top-[33%] right-[69%] z-10 w-[26%] text-muted-foreground/80"
			in:fade={reduce ? { duration: 0 } : { duration: 240, delay: 700 }}
		>
			<path
				d="M8 4 C 6 26, 30 46, 76 42"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-dasharray="5 5"
			/>
			<path
				d="M66 33 L81 42 L68 52"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<img
			src="/einstein-quote.png"
			alt="Ilustrasi Albert Einstein menjulurkan lidah"
			class="einstein w-full"
		/>
	</div>
</section>

<style>
	/* The illustration's cropped right/bottom edges dissolve through a narrow band of loose
	   diagonal hatching (sketch strokes, not a plain fade): a solid core covers almost the whole
	   figure, and an irregular two-weight stripe pattern thins out only along the last stretch
	   before the edge (union of core + hatch∩fade via mask-composite). */
	.einstein {
		-webkit-mask-image:
			radial-gradient(110% 130% at 0% 0%, #000 80%, transparent 87%),
			repeating-linear-gradient(
				115deg,
				#000 0 4px,
				transparent 4px 6.5px,
				#000 6.5px 8px,
				transparent 8px 12px
			),
			radial-gradient(110% 130% at 0% 0%, #000 78%, transparent 91%);
		-webkit-mask-size:
			100% 100%,
			auto,
			100% 100%;
		-webkit-mask-repeat: no-repeat, repeat, no-repeat;
		-webkit-mask-composite: source-over, source-in, source-over;
		mask-image:
			radial-gradient(110% 130% at 0% 0%, #000 80%, transparent 87%),
			repeating-linear-gradient(
				115deg,
				#000 0 4px,
				transparent 4px 6.5px,
				#000 6.5px 8px,
				transparent 8px 12px
			),
			radial-gradient(110% 130% at 0% 0%, #000 78%, transparent 91%);
		mask-size:
			100% 100%,
			auto,
			100% 100%;
		mask-repeat: no-repeat, repeat, no-repeat;
		mask-composite: add, intersect, add;
	}

	/* Uneven radii read as a hand-drawn thought cloud. */
	.bubble {
		border-radius: 53% 47% 52% 48% / 55% 60% 40% 45%;
	}
</style>
