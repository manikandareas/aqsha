<script lang="ts">
	import { FEYNMAN_QUOTE, ONBOARDING_COPY } from '../lib/onboarding-content';

	const copy = ONBOARDING_COPY.welcome;
</script>

<section>
	<p class="mb-4 font-mono text-xs tracking-wider text-muted-foreground">{copy.eyebrow}</p>
	<blockquote class="max-w-3xl border-l border-border pl-5">
		<p class="font-heading text-2xl leading-tight text-foreground sm:text-3xl">
			“{FEYNMAN_QUOTE.text}”
		</p>
		<footer class="mt-3 font-mono text-xs text-muted-foreground">
			— {FEYNMAN_QUOTE.attribution}
		</footer>
	</blockquote>
	<p class="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
		{FEYNMAN_QUOTE.interpretation}
	</p>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading mt-8 max-w-3xl text-4xl leading-none font-normal tracking-tight text-foreground outline-none sm:text-5xl"
	>
		{copy.title}
	</h1>
	<p class="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{copy.description}</p>
</section>
