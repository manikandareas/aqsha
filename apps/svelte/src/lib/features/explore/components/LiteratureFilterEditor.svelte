<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Switch } from '@aqsha/ui-svelte/components/switch';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { ChevronRightIcon, Icon, XIcon } from '$lib/icons';
	import {
		reconcileFilterAccordionState,
		type FilterAccordionState
	} from '../filter-accordion-state';
	import type {
		LiteratureEntityKind,
		LiteratureFilterCategoryId,
		LiteratureFilterClause,
		LiteratureFilterDefinition,
		LiteratureFilterId,
		LiteratureFilterValue
	} from '$lib/features/explore/literature-search-types';

	type LiteratureRangeValue = { min?: number | string; max?: number | string };

	/**
	 * Filter Builder body, shared by the docked panel and the mobile drawer. Holds every edit as
	 * local draft state and only reports it upward through `onChange`; nothing here fetches or
	 * touches the URL — the parent commits on `onApply`.
	 *
	 * Fields are regrouped rather than listed in catalog order: a category's on/off filters collapse
	 * into one divided card at the top (they read as a checklist, not as six separate boxes), and the
	 * remaining fields follow in catalog order with one shell per control kind so labels, heights,
	 * and hints line up.
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
		draft: { q: string; filters: LiteratureFilterClause[] };
		onChange: (patch: { filters: LiteratureFilterClause[] }) => void;
		onApply: () => void;
		onReset: () => void;
	} = $props();

	const uid = $props.id();

	// OpenAlex entity filters take opaque IDs. Without a concrete example the field reads as a dead
	// end, so each entity kind carries the shape of the ID it wants.
	const ENTITY_HINTS: Record<LiteratureEntityKind, string> = {
		works: 'ID karya OpenAlex, mis. W2741809807',
		authors: 'ID penulis OpenAlex, mis. A5023888391',
		sources: 'ID jurnal/sumber OpenAlex, mis. S137773608',
		institutions: 'ID institusi OpenAlex, mis. I27837315',
		concepts: 'ID konsep OpenAlex, mis. C71924100',
		publishers: 'ID penerbit OpenAlex, mis. P4310320990',
		funders: 'ID funder OpenAlex, mis. F4320332161',
		topics: 'ID topik OpenAlex, mis. T11636',
		keywords: 'ID kata kunci OpenAlex, mis. cardiac-imaging'
	};

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

	function togglesForCategory(category: LiteratureFilterCategoryId): LiteratureFilterDefinition[] {
		return catalog.filters.filter(
			(filter) => filter.category === category && filter.kind === 'toggle'
		);
	}

	function fieldsForCategory(category: LiteratureFilterCategoryId): LiteratureFilterDefinition[] {
		return catalog.filters.filter(
			(filter) => filter.category === category && filter.kind !== 'toggle'
		);
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
		if (Array.isArray(value)) return value;
		return typeof value === 'string' && value.trim() ? [value] : [];
	}

	function toggleMultiOption(filterId: LiteratureFilterId, option: string): void {
		const current = multiValue(filterId);
		const next = current.includes(option)
			? current.filter((item) => item !== option)
			: [...current, option];
		setValue(filterId, next.length > 0 ? next : undefined);
	}

	// Free-form list fields commit on change (blur/Enter), not on input: re-deriving the text from
	// the parsed array on every keystroke would eat the separator being typed and jump the caret.
	function setListFromText(filterId: LiteratureFilterId, raw: string): void {
		const items = raw
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
		setValue(filterId, items.length > 0 ? items : undefined);
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

	// 16px on touch widths — anything smaller makes iOS Safari zoom the page when the field focuses.
	const inputClass =
		'h-10 w-full min-w-0 max-w-full rounded-md border-2 border-border bg-background px-2.5 text-base text-foreground outline-none transition-colors focus-visible:border-ring sm:h-9 sm:text-[13px]';
	const fieldLabelClass = 'text-label font-medium text-muted-foreground';
	const boundLabelClass = 'grid min-w-0 gap-1 text-[11.5px] font-medium text-muted-foreground';
	const hintClass = 'text-[11.5px] leading-snug text-muted-foreground/80';
	const fieldStackClass = 'grid min-w-0 gap-1.5';
	const rangeGridClass = 'grid grid-cols-2 gap-2';

	function optionChipClass(selected: boolean): string {
		return cn(
			'inline-flex h-8 max-w-full items-center rounded-full border-2 px-3 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
			selected
				? 'border-transparent bg-primary text-primary-foreground'
				: 'border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground'
		);
	}
</script>

<div class="@container/filter-field flex min-h-full min-w-0 flex-1 flex-col gap-4">
	{#if activeClauses.length > 0}
		<section class="grid min-w-0 gap-2" aria-label="Filter aktif">
			<h3 class={fieldLabelClass}>Filter aktif</h3>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each activeClauses as { clause, definition } (clause.id)}
					<span
						class="inline-flex max-w-full items-center gap-1.5 rounded-full border-2 border-border bg-background py-1 pr-1.5 pl-3 text-label font-medium text-foreground"
					>
						<span class="min-w-0 truncate">{chipLabel(clause, definition)}</span>
						<button
							type="button"
							onclick={() => removeClause(clause.id)}
							aria-label={`Hapus filter ${definition.label}`}
							class="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<Icon icon={XIcon} class="size-3" />
						</button>
					</span>
				{/each}
			</div>
		</section>
	{/if}

	<div class="min-h-0 min-w-0 flex-1 space-y-0.5">
		{#each catalog.categories as category (category.id)}
			{@const toggles = togglesForCategory(category.id)}
			{@const fields = fieldsForCategory(category.id)}
			{@const count = activeCountForCategory(category.id)}
			<Collapsible.Root
				open={accordionState.open[category.id] ?? false}
				onOpenChange={(open) => setCategoryOpen(category.id, open)}
			>
				<!-- Leading chevron that swings to 90°, like the nav rail's collapsible sections. -->
				<Collapsible.Trigger
					class="group flex min-h-7 w-full min-w-0 items-center gap-1 rounded-sm px-1 py-1 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<Icon
						icon={ChevronRightIcon}
						class="size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:rotate-90 motion-reduce:transition-none"
					/>
					<span class="min-w-0 flex-1 truncate text-label font-medium text-muted-foreground"
						>{category.label}</span
					>
					{#if count > 0}
						<span
							class="shrink-0 rounded-full bg-mint-soft px-1.5 py-0.5 text-micro text-mint-foreground"
							>{count}</span
						>
					{/if}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="min-w-0 space-y-5 pt-2 pr-1 pb-5 pl-4">
						{#if toggles.length === 0 && fields.length === 0}
							<p class={hintClass}>Belum ada filter pada kategori ini.</p>
						{/if}
						{#if toggles.length > 0}
							<fieldset class="min-w-0 rounded-md border-2 border-border bg-background">
								<legend class="sr-only">Opsi {category.label}</legend>
								{#each toggles as filter (filter.id)}
									<label
										class="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5 text-[13px] font-medium text-foreground last:border-b-0"
										for={`${uid}-${filter.id}`}
									>
										<span class="min-w-0 leading-snug">{filter.label}</span>
										<Switch
											id={`${uid}-${filter.id}`}
											class="shrink-0"
											checked={boolValue(filter.id)}
											onCheckedChange={(checked) => setValue(filter.id, checked ? true : undefined)}
										/>
									</label>
								{/each}
							</fieldset>
						{/if}
						{#each fields as filter (filter.id)}
							{@render filterField(filter)}
						{/each}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/each}
	</div>

	<div
		class="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-2 border-t border-sidebar-border bg-sidebar pt-3 pb-3 @min-[20rem]/filter-field:flex-row @min-[20rem]/filter-field:items-center @min-[20rem]/filter-field:justify-between"
	>
		<Button
			type="button"
			variant="outline"
			class="w-full @min-[20rem]/filter-field:w-auto"
			onclick={onReset}>Reset filter</Button
		>
		<Button
			type="button"
			class="w-full @min-[20rem]/filter-field:w-auto"
			onclick={onApply}
			disabled={!draft.q.trim()}>Terapkan filter</Button
		>
	</div>
</div>

{#snippet filterField(filter: LiteratureFilterDefinition)}
	{#if filter.kind === 'number-range' || filter.kind === 'date-range'}
		{@const range = rangeValue(filter.id)}
		{@const dates = filter.kind === 'date-range'}
		<fieldset class={fieldStackClass}>
			<legend class={cn(fieldLabelClass, 'mb-1.5')}>{filter.label}</legend>
			<div class={rangeGridClass}>
				<label class={boundLabelClass} for={`${uid}-${filter.id}-min`}>
					<span>{dates ? 'Dari' : 'Min'}</span>
					<input
						id={`${uid}-${filter.id}-min`}
						type={dates ? 'date' : 'number'}
						inputmode={dates ? undefined : 'numeric'}
						value={dates ? (typeof range.min === 'string' ? range.min : '') : (range.min ?? '')}
						oninput={(event) =>
							dates
								? setDateBound(filter.id, 'min', event.currentTarget.value)
								: setNumberBound(filter.id, 'min', event.currentTarget.value)}
						class={inputClass}
					/>
				</label>
				<label class={boundLabelClass} for={`${uid}-${filter.id}-max`}>
					<span>{dates ? 'Sampai' : 'Maks'}</span>
					<input
						id={`${uid}-${filter.id}-max`}
						type={dates ? 'date' : 'number'}
						inputmode={dates ? undefined : 'numeric'}
						value={dates ? (typeof range.max === 'string' ? range.max : '') : (range.max ?? '')}
						oninput={(event) =>
							dates
								? setDateBound(filter.id, 'max', event.currentTarget.value)
								: setNumberBound(filter.id, 'max', event.currentTarget.value)}
						class={inputClass}
					/>
				</label>
			</div>
		</fieldset>
	{:else if filter.kind === 'select'}
		{@const selectId = `${uid}-${filter.id}`}
		{@const selected = textValue(filter.id)}
		<div class={fieldStackClass}>
			<span id={`${selectId}-label`} class={fieldLabelClass}>{filter.label}</span>
			<Select.Root
				type="single"
				value={selected}
				onValueChange={(value) => setValue(filter.id, value || undefined)}
			>
				<Select.Trigger id={selectId} aria-labelledby={`${selectId}-label`} class="w-full min-w-0">
					<span class="truncate">
						{filter.options?.find((option) => option.value === selected)?.label ?? 'Pilih opsi'}
					</span>
				</Select.Trigger>
				<Select.Content>
					{#each filter.options ?? [] as option (option.value)}
						<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{:else if filter.kind === 'multi-select' && (filter.options?.length ?? 0) > 0}
		{@const selectedValues = multiValue(filter.id)}
		<fieldset class={fieldStackClass}>
			<legend class={cn(fieldLabelClass, 'mb-1.5')}>{filter.label}</legend>
			<div class="flex flex-wrap gap-1.5">
				{#each filter.options ?? [] as option (option.value)}
					{@const selected = selectedValues.includes(option.value)}
					<button
						type="button"
						aria-pressed={selected}
						onclick={() => toggleMultiOption(filter.id, option.value)}
						class={optionChipClass(selected)}
					>
						<span class="min-w-0 truncate">{option.label}</span>
					</button>
				{/each}
			</div>
		</fieldset>
	{:else if filter.kind === 'multi-select'}
		<!-- Catalog ships no option list for this one, so it falls back to a comma-separated list. -->
		<div class={fieldStackClass}>
			<label class={fieldLabelClass} for={`${uid}-${filter.id}`}>{filter.label}</label>
			<input
				id={`${uid}-${filter.id}`}
				type="text"
				value={multiValue(filter.id).join(', ')}
				onchange={(event) => setListFromText(filter.id, event.currentTarget.value)}
				placeholder="Pisahkan dengan koma"
				class={inputClass}
			/>
			<p class={hintClass}>Pisahkan beberapa nilai dengan koma.</p>
		</div>
	{:else}
		{@const hint = filter.entityKind ? ENTITY_HINTS[filter.entityKind] : null}
		<div class={fieldStackClass}>
			<label class={fieldLabelClass} for={`${uid}-${filter.id}`}>{filter.label}</label>
			<input
				id={`${uid}-${filter.id}`}
				type="text"
				value={textValue(filter.id)}
				oninput={(event) => setValue(filter.id, event.currentTarget.value || undefined)}
				placeholder={filter.entityKind ? 'Tempel atau ketik ID' : undefined}
				aria-describedby={hint ? `${uid}-${filter.id}-hint` : undefined}
				class={inputClass}
			/>
			{#if hint}
				<p id={`${uid}-${filter.id}-hint`} class={hintClass}>{hint}</p>
			{/if}
		</div>
	{/if}
{/snippet}
