<script lang="ts">
	import { tick } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { Icon, ArrowDownAZIcon, FilterIcon, SearchIcon, XIcon } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { InputGroup, InputGroupAddon, InputGroupInput } from '@aqsha/ui-svelte/components/input-group';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type {
		WorkspaceArtifactSort,
		WorkspaceArtifactType
	} from '$lib/features/workspaces/utils/workspace-library-model';

	const workspaceArtifactTypeOptions = [
		{ value: 'pdf', label: 'PDF' },
		{ value: 'plain_text', label: 'TXT' },
		{ value: 'docx', label: 'DOCX' },
		{ value: 'mermaid', label: 'Diagram' },
		{ value: 'svg', label: 'SVG' },
		{ value: 'markdown', label: 'Markdown' },
		{ value: 'url', label: 'URL' },
		{ value: 'csv', label: 'CSV' },
		{ value: 'json', label: 'JSON' },
		{ value: 'code', label: 'Code' },
		{ value: 'html', label: 'HTML' }
	] as const satisfies Array<{ value: WorkspaceArtifactType; label: string }>;

	const workspaceArtifactSortOptions = [
		{ value: 'updated-desc', label: 'Terbaru' },
		{ value: 'updated-asc', label: 'Terlama' },
		{ value: 'created-desc', label: 'Baru dibuat' },
		{ value: 'created-asc', label: 'Paling lama dibuat' },
		{ value: 'title-asc', label: 'Judul A-Z' },
		{ value: 'title-desc', label: 'Judul Z-A' }
	] as const satisfies Array<{ value: WorkspaceArtifactSort; label: string }>;

	// Shared ghost icon-button shell for the compact toolbar controls. Active state is
	// carried by a primary tint (no heavy border), keeping the header row light.
	const controlButtonClass =
		'size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground';
	const controlButtonActiveClass = 'bg-primary/10 text-primary hover:text-primary';

	let {
		query,
		selectedTypes,
		sort,
		onQueryChange,
		onToggleType,
		onSortChange
	}: {
		query: string;
		selectedTypes: WorkspaceArtifactType[];
		sort: WorkspaceArtifactSort;
		onQueryChange: (query: string) => void;
		onToggleType: (type: WorkspaceArtifactType) => void;
		onSortChange: (sort: WorkspaceArtifactSort) => void;
	} = $props();

	const selectedTypeCount = $derived(selectedTypes.length);
	const activeSortLabel = $derived(
		workspaceArtifactSortOptions.find((option) => option.value === sort)?.label ?? 'Terbaru'
	);
	const hasActiveTypeFilter = $derived(selectedTypeCount > 0);
	const hasActiveSort = $derived(sort !== 'updated-desc');
	const hasQuery = $derived(query.trim().length > 0);

	// Search collapses to a lone ghost icon; clicking it expands an inline field in
	// place. It re-collapses on Escape (clears) or on blur when empty — a lingering
	// query keeps a dot on the icon so the active filter stays visible even collapsed.
	let searchExpanded = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	const reduce = $derived(prefersReducedMotion.current);

	const collapseSearch = () => (searchExpanded = false);

	async function expandSearch() {
		searchExpanded = true;
		await tick();
		searchInputEl?.focus();
	}
</script>

<div class="flex min-w-0 items-center gap-1">
	{#if searchExpanded}
		<!-- Grow/shrink horizontally so expanding search eases the filter/sort buttons over instead of snapping. -->
		<div class="min-w-0" transition:slide={reduce ? { duration: 0 } : { axis: 'x', duration: 200 }}>
			<InputGroup
				class="h-7 w-[168px] min-w-0 max-w-[55vw] rounded-full border-border/70 bg-muted/20 shadow-none transition-colors focus-within:border-ring focus-within:bg-background sm:w-[200px] sm:max-w-none"
			>
				<InputGroupAddon>
					<Icon icon={SearchIcon} class="size-3.5 shrink-0 text-muted-foreground" />
				</InputGroupAddon>
				<InputGroupInput
					bind:ref={searchInputEl}
					value={query}
					oninput={(event) => onQueryChange(event.currentTarget.value)}
					onkeydown={(event) => {
						if (event.key === 'Escape') {
							onQueryChange('');
							collapseSearch();
						}
					}}
					onblur={() => {
						if (!hasQuery) collapseSearch();
					}}
					placeholder="Cari dokumen…"
					class="h-7 min-w-0 text-[12px]"
					aria-label="Cari dokumen"
				/>
				<InputGroupAddon align="inline-end">
					<button
						type="button"
						onclick={() => {
							onQueryChange('');
							collapseSearch();
						}}
						aria-label="Bersihkan pencarian"
						class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
					>
						<Icon icon={XIcon} class="size-3" />
					</button>
				</InputGroupAddon>
			</InputGroup>
		</div>
	{:else}
		<div transition:slide={reduce ? { duration: 0 } : { axis: 'x', duration: 200 }}>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				onclick={expandSearch}
				class={cn('relative', controlButtonClass, hasQuery && controlButtonActiveClass)}
				aria-label={hasQuery ? `Pencarian aktif: ${query.trim()}` : 'Cari dokumen'}
			>
				<Icon icon={SearchIcon} class="size-3.5" />
				{#if hasQuery}
					<span aria-hidden="true" class="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
					></span>
				{/if}
			</Button>
		</div>
	{/if}

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="ghost"
					size="icon-sm"
					class={cn(controlButtonClass, hasActiveTypeFilter && controlButtonActiveClass)}
					aria-label={hasActiveTypeFilter
						? `Filter tipe dokumen aktif: ${selectedTypeCount}`
						: 'Filter tipe dokumen'}
				>
					<Icon icon={FilterIcon} class="size-3.5" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Group>
				<DropdownMenu.Label>Tipe dokumen</DropdownMenu.Label>
				{#each workspaceArtifactTypeOptions as option (option.value)}
					<DropdownMenu.CheckboxItem
						checked={selectedTypes.includes(option.value)}
						onCheckedChange={() => onToggleType(option.value)}
					>
						{option.label}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="ghost"
					size="icon-sm"
					class={cn(controlButtonClass, hasActiveSort && controlButtonActiveClass)}
					aria-label={`Urutkan dokumen: ${activeSortLabel}`}
				>
					<Icon icon={ArrowDownAZIcon} class="size-3.5" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-52">
			<DropdownMenu.Label>Urutkan</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				value={sort}
				onValueChange={(value) => onSortChange(value as WorkspaceArtifactSort)}
			>
				{#each workspaceArtifactSortOptions as option (option.value)}
					<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
