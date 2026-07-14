<script module lang="ts">
	import type { DatasetProfileColumn } from '../../lib/timeline-types';

	/** Di atas ini kolom di-collapse ("+n kolom lagi") supaya dataset lebar tak membanjiri chat. */
	const COLUMN_PREVIEW_MAX = 24;

	/** Label tipe kolom manusiawi; Likert menang (info paling actionable untuk uji instrumen). */
	function typeLabel(column: DatasetProfileColumn): string {
		if (column.likert) return `Likert ${column.likert}`;
		switch (column.type) {
			case 'numeric':
				return 'numerik';
			case 'categorical':
				return 'kategorik';
			case 'text':
				return 'teks';
			default:
				return column.type;
		}
	}
</script>

<script lang="ts">
	import { Icon, AlertCircleIcon, TableIcon } from '$lib/icons';
	import type { DeepStepDetail } from '../../lib/timeline-types';

	type DatasetProfileDetail = Extract<DeepStepDetail, { kind: 'dataset-profile' }>;

	/**
	 * Kartu dataset — hasil `profile_dataset` sebagai objek yang terasa nyata di chat (fase A):
	 * header shape ("n baris × m kolom"), chip per kolom (tipe terdeteksi + warning missing),
	 * footer total sel kosong. Field profil yang tak terbaca disembunyikan, bukan crash
	 * (parse defensif di `datasetProfileSummary`). Port `dataset-profile-card.tsx`.
	 */
	let { detail }: { detail: DatasetProfileDetail } = $props();

	const profile = $derived(detail.profile);
	let expanded = $state(false);
	const visible = $derived(
		expanded ? profile.columns : profile.columns.slice(0, COLUMN_PREVIEW_MAX)
	);
	const hiddenCount = $derived(profile.columns.length - visible.length);
	const missingCells = $derived(profile.columns.reduce((sum, c) => sum + c.missing, 0));
	const missingColumns = $derived(profile.columns.filter((c) => c.missing > 0).length);
	const shape = $derived(
		[
			...(profile.rowCount !== undefined ? [`${profile.rowCount} baris`] : []),
			`${profile.columns.length} kolom`
		].join(' × ')
	);
</script>

<div class="my-0.5 flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/20 px-3 py-2.5">
	<div class="flex min-w-0 items-center gap-2">
		<Icon icon={TableIcon} class="size-3.5 shrink-0 text-muted-foreground" />
		<span class="min-w-0 truncate font-medium text-foreground">Dataset</span>
		<span class="shrink-0 text-[12px] text-muted-foreground">{shape}</span>
	</div>
	<div class="flex min-w-0 flex-wrap gap-1">
		{#each visible as column (column.name)}
			<span
				class="inline-flex max-w-full items-center gap-1 rounded-md border bg-background/60 px-1.5 py-0.5 text-[11px]"
			>
				<span class="truncate font-medium text-foreground">{column.name}</span>
				<span class="shrink-0 text-muted-foreground">{typeLabel(column)}</span>
				{#if column.missing > 0}
					<Icon
						icon={AlertCircleIcon}
						class="size-3 shrink-0 text-amber-500"
						aria-label={`${column.missing} sel kosong`}
					/>
				{/if}
			</span>
		{/each}
		{#if hiddenCount > 0}
			<button
				type="button"
				onclick={() => (expanded = true)}
				class="rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
			>
				+{hiddenCount} kolom lagi
			</button>
		{/if}
	</div>
	{#if missingCells > 0}
		<p class="text-[12px] text-muted-foreground">
			{missingCells} sel kosong di {missingColumns} kolom
		</p>
	{/if}
</div>
