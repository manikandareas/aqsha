<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, SearchIcon, FilterIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Query input + Filter trigger for direct literature search. `compact` switches between the
	 * wide landing bar and the trimmed bar shown above results; both variants keep the same Filter
	 * button so desktop/mobile result state can wire it to the sidebar-focus/drawer behavior. Typing
	 * only reports the draft value upward — the parent owns state and decides when a query actually
	 * commits to the URL. `filterTriggerProps` is an escape hatch so the landing composition can make
	 * this exact button the real anchor for `LiteratureFilterPopover` (bits-ui positions the popover
	 * relative to whichever element receives its trigger props).
	 */
	let {
		compact = false,
		value,
		onValueChange,
		onSubmit,
		onOpenFilters,
		filterTriggerProps
	}: {
		compact?: boolean;
		value: string;
		onValueChange: (query: string) => void;
		onSubmit: () => void;
		onOpenFilters: () => void;
		filterTriggerProps?: Record<string, unknown>;
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
		{...filterTriggerProps}
		class="shrink-0 gap-1.5"
	>
		<Icon icon={FilterIcon} class="size-4" />
		Filter
	</Button>
	<Button type="submit" size={compact ? 'sm' : 'default'} class="shrink-0">Cari</Button>
</form>
