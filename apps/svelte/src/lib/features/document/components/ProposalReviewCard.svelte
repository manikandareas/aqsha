<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Icon, SparklesIcon, AlertCircleIcon } from '$lib/icons';
	import type { PendingProposalView, ProposalHunk, TypstCompileError } from '../api';

	/**
	 * Kartu tinjau usulan suntingan Astra: diff per hunk dengan checkbox terima/tolak per segmen.
	 * Default semua tercentang — satu klik Terima ≡ terima utuh. Usulan basi (sumber berubah sejak
	 * dibuat) → checkbox nonaktif, hanya Tolak (accept CAS menolak menimpa).
	 */
	let {
		proposal,
		accepting,
		acceptErrors,
		onAccept,
		onReject
	}: {
		proposal: NonNullable<PendingProposalView>;
		accepting: boolean;
		acceptErrors: TypstCompileError[] | null;
		onAccept: (acceptedHunkIndexes: number[] | undefined) => void;
		onReject: () => void;
	} = $props();

	// Indeks hunk yang TIDAK dicentang — kosong = terima utuh (fast-path tanpa compile ulang).
	const deselected = new SvelteSet<number>();
	$effect(() => {
		void proposal.id;
		deselected.clear();
	});

	const total = $derived(proposal.hunks.length);
	const selectedCount = $derived(total - deselected.size);

	type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string };
	// Marker "\ No newline at end of file" bukan baris konten — dilewati.
	function hunkLines(hunk: ProposalHunk): DiffLine[] {
		const out: DiffLine[] = [];
		for (const raw of hunk.lines) {
			if (raw.startsWith('\\')) continue;
			const type = raw.startsWith('+') ? 'add' : raw.startsWith('-') ? 'del' : 'ctx';
			out.push({ type, text: raw.slice(1) });
		}
		return out;
	}

	function toggleHunk(index: number, checked: boolean): void {
		if (checked) deselected.delete(index);
		else deselected.add(index);
	}

	function toggleAll(checked: boolean): void {
		if (checked) deselected.clear();
		else for (const hunk of proposal.hunks) deselected.add(hunk.index);
	}

	function handleAccept(): void {
		onAccept(
			deselected.size === 0
				? undefined
				: proposal.hunks.filter((h) => !deselected.has(h.index)).map((h) => h.index)
		);
	}
</script>

<div class="flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4">
	<div class="flex items-start gap-2">
		<Icon icon={SparklesIcon} class="mt-0.5 size-4 text-primary" />
		<div class="min-w-0 flex-1">
			<h2 class="font-heading text-base font-bold">Usulan suntingan Astra</h2>
			<p class="text-label text-muted-foreground">{proposal.summary}</p>
		</div>
		{#if total > 1 && !proposal.isStale}
			<label class="flex shrink-0 select-none items-center gap-2 text-label text-muted-foreground">
				<Checkbox
					bind:checked={() => deselected.size === 0, toggleAll}
					bind:indeterminate={() => deselected.size > 0 && deselected.size < total, () => {}}
					disabled={accepting}
				/>
				Pilih semua
			</label>
		{/if}
	</div>

	{#if proposal.isStale}
		<div
			class="flex items-center gap-2 rounded-md border-2 border-border bg-muted/40 px-3 py-2 text-label text-muted-foreground"
		>
			<Icon icon={AlertCircleIcon} class="size-4 shrink-0" />
			Sumber berubah sejak usulan dibuat. Tolak lalu minta Astra menyusun ulang.
		</div>
	{/if}

	<div class="flex max-h-96 flex-col gap-2 overflow-y-auto">
		{#each proposal.hunks as hunk (hunk.index)}
			<div
				class="rounded-md border-2 border-border bg-background {deselected.has(hunk.index)
					? 'opacity-50'
					: ''}"
			>
				<label
					class="flex select-none items-center gap-2 border-b-2 border-border px-2 py-1.5 text-label text-muted-foreground"
				>
					<Checkbox
						bind:checked={() => !deselected.has(hunk.index), (v) => toggleHunk(hunk.index, v)}
						disabled={proposal.isStale || accepting}
					/>
					Baris {hunk.oldStart}–{hunk.oldStart + Math.max(hunk.oldLines, 1) - 1}
					{#if deselected.has(hunk.index)}
						<span class="ml-auto">tidak diterapkan</span>
					{/if}
				</label>
				<div class="overflow-x-auto">
					<div class="min-w-max font-mono text-label leading-relaxed">
						{#each hunkLines(hunk) as line, i (i)}
							<div
								class="flex whitespace-pre px-2 {line.type === 'add'
									? 'bg-mint/20'
									: line.type === 'del'
										? 'bg-coral/20'
										: ''}"
							>
								<span class="mr-2 select-none text-muted-foreground"
									>{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span
								><span>{line.text}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if acceptErrors && acceptErrors.length > 0}
		<div
			class="flex flex-col gap-1 rounded-md border-2 border-destructive/40 bg-destructive/5 px-3 py-2"
		>
			<div class="flex items-center gap-2 text-label font-medium text-destructive">
				<Icon icon={AlertCircleIcon} class="size-4 shrink-0" />
				Hasil pilihan hunk gagal compile — ubah pilihan atau tolak.
			</div>
			{#each acceptErrors.slice(0, 10) as err, i (i)}
				<p class="text-label text-muted-foreground">
					{err.line > 0 ? `baris ${err.line}: ` : ''}{err.message}
				</p>
			{/each}
		</div>
	{/if}

	<div class="flex justify-end gap-2">
		<Button type="button" variant="outline" onclick={onReject}>Tolak</Button>
		<Button
			type="button"
			disabled={proposal.isStale || accepting || (total > 0 && selectedCount === 0)}
			onclick={handleAccept}
		>
			{#if accepting}
				<Spinner class="size-4" />
			{/if}
			{total > 1 ? `Terima (${selectedCount}/${total})` : 'Terima'}
		</Button>
	</div>
</div>
