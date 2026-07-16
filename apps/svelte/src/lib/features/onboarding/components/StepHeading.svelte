<script lang="ts">
	// Shared centered step heading. `data-onboarding-heading` + tabindex=-1 is the focus-handoff
	// target when the active step changes. No eyebrow — the step badge above the swap area already
	// names where the user is.
	let { title, subtitle }: { title: string; subtitle: string } = $props();
</script>

<header class="mb-8 text-center">
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading mx-auto max-w-2xl text-3xl leading-tight font-normal tracking-tight text-balance text-foreground outline-none sm:text-4xl"
	>
		{title}
	</h1>
	<p class="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground">
		{subtitle}
	</p>
</header>
