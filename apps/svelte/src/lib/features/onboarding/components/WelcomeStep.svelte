<script lang="ts">
	import { FEYNMAN_QUOTE, ONBOARDING_COPY } from '../lib/onboarding-content';
	import StepHeading from './StepHeading.svelte';

	const copy = ONBOARDING_COPY.welcome;
</script>

<section class="text-center">
	<div class="stagger" style="--stagger-duration: 460ms; --stagger-step: 70ms">
		<div style="--i: 1">
			<StepHeading size="hero" title={copy.title} subtitle={copy.description} />
		</div>
		<div style="--i: 2">
			<!-- The Feynman quote as an index card pinned onto the desk. -->
			<div
				class="relative mx-auto mt-10 max-w-xl -rotate-1 rounded-lg border-2 border-border bg-card p-5 text-left"
			>
				<span
					aria-hidden="true"
					class="absolute -top-3 left-8 h-6 w-20 -rotate-3 rounded-sm border-2 border-lemon-soft-border bg-lemon-soft opacity-90"
				></span>
				<figure>
					<blockquote>
						<p class="font-heading text-lg leading-snug text-foreground sm:text-xl">
							“{FEYNMAN_QUOTE.text}”
						</p>
					</blockquote>
					<figcaption class="mt-2.5 font-mono text-xs text-muted-foreground">
						—
						<a
							href={FEYNMAN_QUOTE.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
						>
							{FEYNMAN_QUOTE.attribution}
						</a>
						· pidato Caltech, 1974
					</figcaption>
				</figure>
				<p
					class="mt-3.5 border-t-2 border-dashed border-border pt-3 text-sm leading-relaxed text-muted-foreground"
				>
					{FEYNMAN_QUOTE.interpretation}
				</p>
			</div>
		</div>
	</div>
</section>
