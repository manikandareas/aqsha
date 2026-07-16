<script lang="ts">
	// Shared step heading. `data-onboarding-heading` + tabindex=-1 is the focus-handoff target when
	// the active step changes.
	let { eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string } = $props();
</script>

<header class="mb-6">
	<p class="mb-3 font-mono text-xs tracking-wider text-muted-foreground">{eyebrow}</p>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading text-3xl leading-none font-normal tracking-tight text-foreground outline-none sm:text-4xl"
	>
		{title}
	</h1>
	<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
</header>
