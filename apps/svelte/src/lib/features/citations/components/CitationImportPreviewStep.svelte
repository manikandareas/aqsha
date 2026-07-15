<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { CheckIcon, Icon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import {
		CITATION_STATUS_LABELS,
		citationMetaLine,
		type ImportDuplicatePolicy,
		type ImportPreviewResult
	} from '../types';

	/**
	 * Langkah preview (checkbox + policy duplikat + commit). Dipakai wizard import file
	 * DAN wizard sinkron provider — didorong murni oleh `ImportPreviewResult`.
	 */
	let {
		preview,
		selected,
		onToggle,
		policy,
		onPolicyChange,
		error,
		pending,
		onBack,
		onCommit,
		title,
		backLabel = 'Ganti file'
	}: {
		preview: ImportPreviewResult;
		selected: Set<number>;
		onToggle: (index: number) => void;
		policy: ImportDuplicatePolicy;
		onPolicyChange: (policy: ImportDuplicatePolicy) => void;
		error: string | null;
		pending: boolean;
		onBack: () => void;
		onCommit: () => void;
		/** Judul dialog kustom (default: "Preview import (.bib/.ris)"). */
		title?: string;
		backLabel?: string;
	} = $props();

	const formatLabel = $derived(
		preview.format === 'bibtex' ? '.bib' : preview.format === 'ris' ? '.ris' : null
	);
	const chips = $derived([
		{ label: `${preview.counts.valid} valid`, tone: 'text-foreground' },
		{ label: `${preview.counts.incomplete} belum lengkap`, tone: 'text-amber-600' },
		{ label: `${preview.counts.duplicate} duplikat`, tone: 'text-lavender-foreground' },
		{ label: `${preview.counts.error} error`, tone: 'text-destructive' }
	] as const);

	const policyOptions = [
		{ id: 'skip', label: 'lewati' },
		{ id: 'merge', label: 'lengkapi field kosong' },
		{ id: 'import', label: 'import tetap' }
	] as const;
</script>

<Dialog.Header>
	<Dialog.Title>{title ?? `Preview import${formatLabel ? ` (${formatLabel})` : ''}`}</Dialog.Title>
	<Dialog.Description class="flex flex-wrap gap-2">
		{#each chips as chip (chip.label)}
			<span class={cn('rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold', chip.tone)}>
				{chip.label}
			</span>
		{/each}
	</Dialog.Description>
</Dialog.Header>

<div class="max-h-[45vh] overflow-y-auto rounded-lg border border-border/70">
	{#each preview.records as record (record.index)}
		{@const checked = selected.has(record.index)}
		{@const duplicate = record.duplicateOfId || record.duplicateInBatch}
		<button
			type="button"
			onclick={() => onToggle(record.index)}
			class={cn(
				'flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40',
				!checked && 'opacity-55'
			)}
		>
			<span
				aria-hidden="true"
				class={cn(
					'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
					checked
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-background'
				)}
			>
				{#if checked}<Icon icon={CheckIcon} class="size-3" />{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[13px] font-semibold text-foreground">
					{record.title}
				</span>
				<span class="block truncate text-[12px] font-medium text-muted-foreground">
					{citationMetaLine(record)}
				</span>
				<span class="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
					{#if duplicate}
						<span class="rounded-full bg-lavender-soft px-1.5 py-0.5 text-lavender-foreground">
							duplikat{record.duplicateOfTitle ? `: ${record.duplicateOfTitle}` : ''}
						</span>
					{/if}
					{#if record.metadataStatus !== 'verified'}
						<span class="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
							{CITATION_STATUS_LABELS[record.metadataStatus]}
						</span>
					{/if}
					{#each record.issues as issue (issue)}
						<span class="text-muted-foreground/80">{issue}</span>
					{/each}
				</span>
			</span>
		</button>
	{/each}
	{#if preview.errors.length > 0}
		<details class="border-t border-border/70 px-3 py-2">
			<summary class="cursor-pointer text-[12px] font-semibold text-destructive">
				{preview.errors.length} entry gagal diparse
			</summary>
			<ul class="mt-1 grid gap-1 text-[11px] font-medium text-muted-foreground">
				{#each preview.errors as err (`${err.index}-${err.message}`)}
					<li class="truncate">#{err.index + 1}: {err.message}</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<fieldset class="flex flex-wrap items-center gap-3">
	<legend class="sr-only">Kebijakan duplikat</legend>
	<span class="text-[12px] font-semibold text-foreground">Duplikat:</span>
	{#each policyOptions as option (option.id)}
		<label
			class="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-muted-foreground"
		>
			<input
				type="radio"
				name="duplicate-policy"
				checked={policy === option.id}
				onchange={() => onPolicyChange(option.id)}
			/>
			{option.label}
		</label>
	{/each}
</fieldset>

{#if error}
	<p class="text-[12px] font-medium text-destructive">{error}</p>
{/if}
<Dialog.Footer>
	<Button type="button" variant="ghost" onclick={onBack} disabled={pending}>
		{backLabel}
	</Button>
	<Button type="button" onclick={onCommit} disabled={pending || selected.size === 0}>
		{pending ? 'Mengimpor…' : `Import ${selected.size} referensi`}
	</Button>
</Dialog.Footer>
