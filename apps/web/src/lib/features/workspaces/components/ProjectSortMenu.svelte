<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Icon, CheckIcon, ChevronDownIcon, ChevronUpIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { PROJECT_SORT_OPTIONS, type ProjectSortId } from '../project-sort';

	/** Trigger + menu urutan proyek — pola "Urutkan: …" berbahasa Indonesia. */
	let {
		value = $bindable<ProjectSortId>('updated-desc')
	}: {
		value?: ProjectSortId;
	} = $props();

	let open = $state(false);

	const activeLabel = $derived(
		PROJECT_SORT_OPTIONS.find((option) => option.id === value)?.label ?? 'Terbaru diedit'
	);
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class={cn(
					'inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
					'text-muted-foreground hover:text-foreground',
					'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
				)}
			>
				<span>Urutkan:</span>
				<span class="font-medium text-foreground">{activeLabel}</span>
				<Icon
					icon={open ? ChevronUpIcon : ChevronDownIcon}
					class="size-3.5 text-muted-foreground"
				/>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-56">
		{#each PROJECT_SORT_OPTIONS as option (option.id)}
			<DropdownMenu.Item
				class="justify-between gap-3"
				onSelect={() => {
					value = option.id;
				}}
			>
				{option.label}
				{#if value === option.id}
					<Icon icon={CheckIcon} class="size-3.5 text-primary" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
