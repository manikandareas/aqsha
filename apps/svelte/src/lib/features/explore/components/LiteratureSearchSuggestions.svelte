<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, SearchIcon } from '$lib/icons';

	let { onSelect }: { onSelect: (query: string) => void } = $props();

	const SUGGESTIONS = [
		{
			query: 'adaptasi iklim perkotaan',
			iconClass:
				'border-coral bg-coral text-white btn-filled-gradient [--btn-face:var(--coral)] dark:border-coral-strong dark:bg-coral-strong dark:[--btn-face:var(--coral-strong)]'
		},
		{
			query: 'transformer neural network',
			iconClass:
				'border-secondary bg-secondary text-secondary-foreground btn-filled-gradient [--btn-face:var(--secondary)]'
		},
		{
			query: 'stunting anak indonesia',
			iconClass:
				'border-mint-strong bg-mint-strong text-white btn-filled-gradient [--btn-face:var(--mint-strong)]'
		}
	] as const;
</script>

<nav aria-label="Saran pencarian" class="flex flex-wrap items-center gap-2">
	{#each SUGGESTIONS as suggestion (suggestion.query)}
		<Button
			type="button"
			variant="outline"
			onclick={() => onSelect(suggestion.query)}
			class="h-8 min-w-0 max-w-full gap-1.5 rounded-full px-2 pr-3 text-left text-label font-semibold"
		>
			<span
				class={`grid size-5 shrink-0 place-items-center rounded-full border ${suggestion.iconClass}`}
				aria-hidden="true"
			>
				<Icon icon={SearchIcon} class="size-3" />
			</span>
			<span class="truncate">{suggestion.query}</span>
		</Button>
	{/each}
</nav>
