<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';

	// Shared centered step heading. `data-onboarding-heading` + tabindex=-1 is the focus-handoff
	// target when the active step changes. No eyebrow — the step badge above the swap area already
	// names where the user is.
	let {
		title,
		subtitle,
		size = 'default',
		class: className
	}: {
		title: string;
		subtitle: string;
		size?: 'default' | 'hero' | 'compact';
		class?: string;
	} = $props();
</script>

<header class={cn('text-center', size === 'default' && 'mb-8', className)}>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class={cn(
			'font-heading mx-auto font-normal tracking-tight text-balance text-foreground outline-none',
			size === 'hero' && 'max-w-3xl text-4xl leading-[1.05] sm:text-5xl',
			size === 'compact' && 'max-w-2xl text-[1.75rem] leading-[1.1] sm:text-3xl',
			size === 'default' && 'max-w-2xl text-3xl leading-tight sm:text-4xl'
		)}
	>
		{title}
	</h1>
	<p
		class={cn(
			'mx-auto max-w-xl text-[15px] leading-relaxed text-muted-foreground',
			size === 'hero' ? 'mt-5' : 'mt-3',
			size === 'default' && 'text-pretty'
		)}
	>
		{subtitle}
	</p>
</header>
