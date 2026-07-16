<script lang="ts">
	import { FEYNMAN_QUOTE, ONBOARDING_COPY } from '../lib/onboarding-content';

	const copy = ONBOARDING_COPY.welcome;
</script>

<section class="text-center">
	<div class="stagger" style="--stagger-duration: 460ms; --stagger-step: 70ms">
		<div style="--i: 1">
			<h1
				data-onboarding-heading
				tabindex="-1"
				class="font-heading mx-auto max-w-3xl text-4xl leading-[1.05] font-normal tracking-tight text-balance text-foreground outline-none sm:text-5xl"
			>
				{copy.title}
			</h1>
		</div>
		<div style="--i: 2">
			<p class="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
				{copy.description}
			</p>
		</div>
		<div style="--i: 3">
			<!-- The Feynman quote as an index card pinned onto the desk. -->
			<div
				class="relative mx-auto mt-10 max-w-xl -rotate-1 rounded-lg border-2 border-border bg-card p-5 text-left shadow-soft-card"
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
						— {FEYNMAN_QUOTE.attribution} · pidato Caltech, 1974
					</figcaption>
				</figure>
				<p class="mt-3.5 border-t-2 border-dashed border-border pt-3 text-sm leading-relaxed text-muted-foreground">
					{FEYNMAN_QUOTE.interpretation}
				</p>
			</div>
		</div>
	</div>
</section>
