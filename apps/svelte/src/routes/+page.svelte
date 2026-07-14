<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';

	// Local UI-only state (plan §3.5: runes, no module-level mutable state).
	let checked = $state(true);
</script>

<main class="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-6 p-8">
	<div class="flex items-center gap-2 text-muted-foreground">
		<HugeiconsIcon icon={CheckmarkCircle02Icon} />
		<span class="text-sm">apps/svelte — Phase 1 scaffold</span>
	</div>

	<h1 class="text-center text-3xl font-semibold tracking-tight text-foreground">
		SvelteKit + shadcn-svelte + Tailwind v4 + Hugeicons
	</h1>

	<p class="text-center text-sm text-muted-foreground">
		Scaffold smoke: shadcn-svelte primitives render with the neutral token set. Visual contract
		(Aqsha golden CSS) lands in Phase 3.
	</p>

	<div class="flex flex-wrap items-center justify-center gap-3">
		<Button>Primary</Button>
		<Button variant="secondary">Secondary</Button>
		<Button variant="outline">Outline</Button>
		<Button variant="destructive">Destructive</Button>
		<Button variant="ghost">Ghost</Button>
	</div>

	<label class="flex items-center gap-2 text-sm text-foreground">
		<Checkbox bind:checked />
		Checkbox is {checked ? 'checked' : 'unchecked'}
	</label>
</main>
