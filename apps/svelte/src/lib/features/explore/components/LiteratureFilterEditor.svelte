<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Switch } from '@aqsha/ui-svelte/components/switch';
	import { ChevronDownIcon, Icon, XIcon } from '$lib/icons';
	import {
		reconcileFilterAccordionState,
		type FilterAccordionState
	} from '../filter-accordion-state';
	import type {
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureFilterId,
		LiteratureFilterValue,
		LiteratureSortId
	} from '$lib/features/explore/literature-search-types';

	type LiteratureRangeValue = { min?: number | string; max?: number | string };

	/**
	 * Reusable Filter Builder body shared by the popover (pre-search), the desktop sidebar, and the
	 * mobile drawer. Holds every edit as local draft state and only reports it upward through
	 * `onChange`; nothing here fetches or touches the URL — the parent commits on `onApply`.
	 */
	let {
		catalog,
		draft,
		onChange,
		onApply,
		onReset
	}: {
		catalog: {
			categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
			filters: LiteratureFilterDefinition[];
		};
		draft: { q: string; sort: LiteratureSortId; filters: LiteratureFilterClause[] };
		onChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
	} = $props();

	const uid = $props.id();

	function cloneFilters(filters: LiteratureFilterClause[]): LiteratureFilterClause[] {
		return filters.map((item) => ({ id: item.id, value: item.value }));
	}

	// Local editable buffer, seeded from the parent draft. A guarded effect resyncs it only when the
	// incoming draft genuinely changed from outside (Reset/Apply/Back-Forward) — never from our own
	// just-emitted `onChange`, so typing never gets clobbered mid-edit.
	let workingFilters = $state<LiteratureFilterClause[]>(untrack(() => cloneFilters(draft.filters)));
	let lastSignature = untrack(() => JSON.stringify(draft.filters));

	$effect(() => {
		const incoming = JSON.stringify(draft.filters);
		if (incoming !== lastSignature) {
			lastSignature = incoming;
			workingFilters = cloneFilters(draft.filters);
		}
	});

	let accordionState = $state<FilterAccordionState>({ initialized: false, open: {} });
	let catalogSignature = $state('');

	$effect(() => {
		const nextSignature = catalog.categories.map((category) => category.id).join('|');
		if (nextSignature.length === 0 || nextSignature === catalogSignature) return;
		catalogSignature = nextSignature;
		accordionState = reconcileFilterAccordionState(accordionState, catalog.categories);
	});

	function filtersForCategory(
		category: LiteratureFilterCategoryId
	): LiteratureFilterDefinition[] {
		return catalog.filters.filter((filter) => filter.category === category);
	}

	type ActiveClause = { clause: LiteratureFilterClause; definition: LiteratureFilterDefinition };
	const activeClauses = $derived<ActiveClause[]>(
		workingFilters.flatMap((clause) => {
			const definition = catalog.filters.find((filter) => filter.id === clause.id);
			return definition ? [{ clause, definition }] : [];
		})
	);

	function activeCountForCategory(category: LiteratureFilterCategoryId): number {
		return activeClauses.filter(({ definition }) => definition.category === category).length;
	}

	function setCategoryOpen(category: LiteratureFilterCategoryId, open: boolean): void {
		accordionState = {
			...accordionState,
			open: { ...accordionState.open, [category]: open }
		};
	}

	function currentValue(filterId: LiteratureFilterId): LiteratureFilterValue | undefined {
		return workingFilters.find((item) => item.id === filterId)?.value;
	}

	function isEmptyValue(value: LiteratureFilterValue | undefined): boolean {
		if (value === undefined || value === null) return true;
		if (typeof value === 'string') return value.trim().length === 0;
		if (Array.isArray(value)) return value.length === 0;
		if (typeof value === 'object') return value.min === undefined && value.max === undefined;
		return false;
	}

	function commit(next: LiteratureFilterClause[]): void {
		workingFilters = next;
		lastSignature = JSON.stringify(next);
		onChange({ filters: next });
	}

	function setValue(filterId: LiteratureFilterId, value: LiteratureFilterValue | undefined): void {
		const withoutClause = workingFilters.filter((item) => item.id !== filterId);
		if (value === undefined || isEmptyValue(value)) {
			commit(withoutClause);
			return;
		}
		commit([...withoutClause, { id: filterId, value }]);
	}

	function removeClause(filterId: LiteratureFilterId): void {
		commit(workingFilters.filter((item) => item.id !== filterId));
	}

	function rangeValue(filterId: LiteratureFilterId): LiteratureRangeValue {
		const value = currentValue(filterId);
		return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	}

	function setNumberBound(filterId: LiteratureFilterId, bound: 'min' | 'max', raw: string): void {
		const next: LiteratureRangeValue = { ...rangeValue(filterId) };
		if (raw.trim() === '') delete next[bound];
		else next[bound] = Number(raw);
		setValue(filterId, next);
	}

	function setDateBound(filterId: LiteratureFilterId, bound: 'min' | 'max', raw: string): void {
		const next: LiteratureRangeValue = { ...rangeValue(filterId) };
		if (raw.trim() === '') delete next[bound];
		else next[bound] = raw;
		setValue(filterId, next);
	}

	function textValue(filterId: LiteratureFilterId): string {
		const value = currentValue(filterId);
		return typeof value === 'string' ? value : '';
	}

	function boolValue(filterId: LiteratureFilterId): boolean {
		return currentValue(filterId) === true;
	}

	function multiValue(filterId: LiteratureFilterId): string[] {
		const value = currentValue(filterId);
		return Array.isArray(value) ? value : [];
	}

	function toggleMultiOption(filterId: LiteratureFilterId, option: string, checked: boolean): void {
		const current = multiValue(filterId);
		const next = checked ? [...current, option] : current.filter((item) => item !== option);
		setValue(filterId, next.length > 0 ? next : undefined);
	}

	function chipLabel(
		clause: LiteratureFilterClause,
		definition: LiteratureFilterDefinition
	): string {
		const value = clause.value;
		if (typeof value === 'boolean') return definition.label;
		if (typeof value === 'string') {
			const option = definition.options?.find((item) => item.value === value);
			return `${definition.label}: ${option?.label ?? value}`;
		}
		if (Array.isArray(value)) {
			const labels = value.map(
				(item) => definition.options?.find((option) => option.value === item)?.label ?? item
			);
			return `${definition.label}: ${labels.join(', ')}`;
		}
		const parts: string[] = [];
		if (value.min !== undefined) parts.push(`min ${value.min}`);
		if (value.max !== undefined) parts.push(`maks ${value.max}`);
		return parts.length > 0 ? `${definition.label} (${parts.join('–')})` : definition.label;
	}

	const inputClass =
		'h-9 rounded-md border-2 border-border bg-background px-2.5 text-[13px] text-foreground outline-none focus-visible:border-ring';
	const fieldLabelClass = 'grid gap-1 text-[12px] font-medium text-muted-foreground';
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	{#if activeClauses.length > 0}
		<div class="flex flex-wrap items-center gap-1.5" aria-label="Filter aktif">
			{#each activeClauses as { clause, definition } (clause.id)}
				<span
					class="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-secondary/40 py-1 pl-3 pr-1.5 text-[12px] font-medium text-foreground"
				>
					{chipLabel(clause, definition)}
					<button
						type="button"
						onclick={() => removeClause(clause.id)}
						aria-label={`Hapus filter ${definition.label}`}
						class="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					>
						<Icon icon={XIcon} class="size-3" />
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
		{#each catalog.categories as category (category.id)}
			{@const filters = filtersForCategory(category.id)}
			{@const count = activeCountForCategory(category.id)}
			<Collapsible.Root
				open={accordionState.open[category.id] ?? false}
				onOpenChange={(open) => setCategoryOpen(category.id, open)}
			>
				<Collapsible.Trigger
					class="group flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-control font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted"
				>
					<span class="min-w-0 truncate">{category.label}</span>
					<span class="flex shrink-0 items-center gap-2">
						{#if count > 0}
							<span class="rounded-full bg-mint-soft px-1.5 py-0.5 text-micro text-mint-foreground">{count}</span>
						{/if}
						<Icon
							icon={ChevronDownIcon}
							class="size-4 transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
						/>
					</span>
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="space-y-4 px-3 pb-4 pt-3">
						{#if filters.length === 0}
							<p class="text-label text-muted-foreground">Belum ada filter pada kategori ini.</p>
						{:else}
							{#each filters as filter (filter.id)}
								{@render filterField(filter)}
							{/each}
						{/if}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/each}
	</div>

	<div class="sticky bottom-0 flex items-center justify-between gap-3 border-t-2 border-border bg-card pt-4">
		<Button type="button" variant="outline" onclick={onReset}>Reset filter</Button>
		<Button type="button" onclick={onApply} disabled={!draft.q.trim()}>Terapkan filter</Button>
	</div>
</div>

{#snippet filterField(filter: LiteratureFilterDefinition)}
	{#if filter.kind === 'number-range'}
		{@const range = rangeValue(filter.id)}
		<div class="grid grid-cols-2 gap-2">
			<label class={fieldLabelClass} for={`${uid}-${filter.id}-min`}>
				{`Minimal ${filter.label.toLowerCase()}`}
				<input
					id={`${uid}-${filter.id}-min`}
					type="number"
					inputmode="numeric"
					value={range.min ?? ''}
					oninput={(event) => setNumberBound(filter.id, 'min', event.currentTarget.value)}
					class={inputClass}
				/>
			</label>
			<label class={fieldLabelClass} for={`${uid}-${filter.id}-max`}>
				{`Maksimal ${filter.label.toLowerCase()}`}
				<input
					id={`${uid}-${filter.id}-max`}
					type="number"
					inputmode="numeric"
					value={range.max ?? ''}
					oninput={(event) => setNumberBound(filter.id, 'max', event.currentTarget.value)}
					class={inputClass}
				/>
			</label>
		</div>
	{:else if filter.kind === 'date-range'}
		{@const range = rangeValue(filter.id)}
		<div class="grid grid-cols-2 gap-2">
			<label class={fieldLabelClass} for={`${uid}-${filter.id}-min`}>
				{`Mulai ${filter.label.toLowerCase()}`}
				<input
					id={`${uid}-${filter.id}-min`}
					type="date"
					value={typeof range.min === 'string' ? range.min : ''}
					oninput={(event) => setDateBound(filter.id, 'min', event.currentTarget.value)}
					class={inputClass}
				/>
			</label>
			<label class={fieldLabelClass} for={`${uid}-${filter.id}-max`}>
				{`Hingga ${filter.label.toLowerCase()}`}
				<input
					id={`${uid}-${filter.id}-max`}
					type="date"
					value={typeof range.max === 'string' ? range.max : ''}
					oninput={(event) => setDateBound(filter.id, 'max', event.currentTarget.value)}
					class={inputClass}
				/>
			</label>
		</div>
	{:else if filter.kind === 'toggle'}
		<label
			class="flex items-center justify-between gap-3 rounded-md border-2 border-border px-3 py-2.5 text-[13px] font-medium text-foreground"
			for={`${uid}-${filter.id}`}
		>
			{filter.label}
			<Switch
				id={`${uid}-${filter.id}`}
				checked={boolValue(filter.id)}
				onCheckedChange={(checked) => setValue(filter.id, checked ? true : undefined)}
			/>
		</label>
	{:else if filter.kind === 'select'}
		{@const selectId = `${uid}-${filter.id}`}
		{@const selected = textValue(filter.id)}
		<div class="grid gap-1">
			<span id={`${selectId}-label`} class="text-[12px] font-medium text-muted-foreground">
				{filter.label}
			</span>
			<Select.Root
				type="single"
				value={selected}
				onValueChange={(value) => setValue(filter.id, value || undefined)}
			>
				<Select.Trigger id={selectId} aria-labelledby={`${selectId}-label`} class="w-full">
					{filter.options?.find((option) => option.value === selected)?.label ?? 'Pilih opsi'}
				</Select.Trigger>
				<Select.Content>
					{#each filter.options ?? [] as option (option.value)}
						<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{:else if filter.kind === 'multi-select'}
		{@const selectedValues = multiValue(filter.id)}
		<fieldset class="grid gap-2">
			<legend class="mb-1 text-[12px] font-medium text-muted-foreground">{filter.label}</legend>
			{#each filter.options ?? [] as option (option.value)}
				<label
					class="flex items-center gap-2.5 text-[13px] text-foreground"
					for={`${uid}-${filter.id}-${option.value}`}
				>
					<Checkbox
						id={`${uid}-${filter.id}-${option.value}`}
						checked={selectedValues.includes(option.value)}
						onCheckedChange={(checked) =>
							toggleMultiOption(filter.id, option.value, checked === true)}
					/>
					{option.label}
				</label>
			{/each}
		</fieldset>
	{:else if filter.kind === 'entity'}
		<label class={fieldLabelClass} for={`${uid}-${filter.id}`}>
			{filter.label}
			<input
				id={`${uid}-${filter.id}`}
				type="text"
				value={textValue(filter.id)}
				oninput={(event) => setValue(filter.id, event.currentTarget.value || undefined)}
				placeholder="Tempel atau ketik ID"
				class={inputClass}
			/>
		</label>
	{:else}
		<label class={fieldLabelClass} for={`${uid}-${filter.id}`}>
			{filter.label}
			<input
				id={`${uid}-${filter.id}`}
				type="text"
				value={textValue(filter.id)}
				oninput={(event) => setValue(filter.id, event.currentTarget.value || undefined)}
				class={inputClass}
			/>
		</label>
	{/if}
{/snippet}
