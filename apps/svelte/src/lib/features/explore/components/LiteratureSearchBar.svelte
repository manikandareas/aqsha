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

<!--
	Wrapping row, not a fixed one: below `sm` the field claims a full basis so the two buttons drop to
	a second line and split it, instead of squeezing the input down to a few visible characters.
-->
<form
	onsubmit={handleSubmit}
	class={cn(
		'flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border-2 border-border bg-background transition-colors focus-within:border-ring/55',
		compact ? 'px-3 py-2' : 'px-3 py-3 sm:px-4 sm:py-3.5'
	)}
>
	<div class="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
		<Icon
			icon={SearchIcon}
			class={cn('shrink-0 text-muted-foreground', compact ? 'size-4' : 'size-4.5')}
		/>
		<input
			{value}
			oninput={(event) => onValueChange(event.currentTarget.value)}
			type="text"
			aria-label="Cari paper"
			placeholder="Cari paper, mis. “adaptasi iklim urban”…"
			class={cn(
				// 16px on touch widths — anything smaller makes iOS Safari zoom the page on focus.
				'min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground',
				compact ? 'sm:text-[13.5px]' : 'sm:text-[15px]'
			)}
		/>
	</div>
	<Button
		type="button"
		variant="outline"
		size={compact ? 'sm' : 'default'}
		onclick={onOpenFilters}
		class="min-w-0 flex-1 gap-1.5 sm:flex-none sm:shrink-0"
	>
		<Icon icon={FilterIcon} class="size-4" />
		Filter
	</Button>
	<Button
		type="submit"
		size={compact ? 'sm' : 'default'}
		class="min-w-0 flex-1 sm:flex-none sm:shrink-0"
	>
		Cari
	</Button>
</form>
