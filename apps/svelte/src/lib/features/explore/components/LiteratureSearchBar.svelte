<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, SearchIcon, FilterIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/** Query input delegates draft updates and mobile drawer navigation to its page owner. */
	let {
		compact = false,
		value,
		onValueChange,
		onSubmit,
		onOpenFilters
	}: {
		compact?: boolean;
		value: string;
		onValueChange: (query: string) => void;
		onSubmit: () => void;
		onOpenFilters: () => void;
	} = $props();

	function handleSubmit(event: SubmitEvent): void {
		event.preventDefault();
		onSubmit();
	}
</script>

<form
	onsubmit={handleSubmit}
	class={cn(
		'flex w-full items-center gap-2 rounded-xl border-2 border-border bg-background transition-colors focus-within:border-ring/55',
		compact ? 'px-3 py-2' : 'px-4 py-3.5'
	)}
>
	<Icon
		icon={SearchIcon}
		class={cn('shrink-0 text-muted-foreground', compact ? 'size-4' : 'size-[18px]')}
	/>
	<input
		{value}
		oninput={(event) => onValueChange(event.currentTarget.value)}
		type="text"
		aria-label="Cari paper"
		placeholder="Cari paper, mis. “adaptasi iklim urban”…"
		class={cn(
			'min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground',
			compact ? 'text-[13.5px]' : 'text-[15px]'
		)}
	/>
	<Button
		type="button"
		variant="outline"
		size={compact ? 'sm' : 'default'}
		onclick={onOpenFilters}
		class="shrink-0 gap-1.5 lg:hidden"
	>
		<Icon icon={FilterIcon} class="size-4" />
		Filter
	</Button>
	<Button type="submit" size={compact ? 'sm' : 'default'} class="shrink-0">Cari</Button>
</form>
