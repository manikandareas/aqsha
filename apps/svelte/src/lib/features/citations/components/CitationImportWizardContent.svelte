<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, UploadIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { useImportCommit, useImportPreview } from '../api';
	import type { ImportCommitResult, ImportDuplicatePolicy, ImportPreviewResult } from '../types';
	import CitationImportPreviewStep from './CitationImportPreviewStep.svelte';

	const MAX_FILE_BYTES = 10 * 1024 * 1024;

	type WizardStep =
		| { step: 'upload' }
		| { step: 'preview'; preview: ImportPreviewResult }
		| { step: 'done'; result: ImportCommitResult };

	let {
		workspaceId,
		onOpenChange,
		onDone
	}: {
		workspaceId: string;
		onOpenChange: (open: boolean) => void;
		onDone: () => void;
	} = $props();

	let wizard = $state<WizardStep>({ step: 'upload' });
	let error = $state<string | null>(null);
	const selected = new SvelteSet<number>();
	let policy = $state<ImportDuplicatePolicy>('skip');
	let dragOver = $state(false);
	const preview = useImportPreview(() => workspaceId);
	const commit = useImportCommit(() => workspaceId);

	async function handleFile(file: File | null | undefined) {
		if (!file) return;
		error = null;
		if (file.size > MAX_FILE_BYTES) {
			error = 'File melebihi batas 10 MB.';
			return;
		}
		try {
			const result = await preview.mutateAsync(file);
			// Default tercentang: valid + incomplete; duplikat mengikuti policy saat commit.
			selected.clear();
			for (const r of result.records) selected.add(r.index);
			wizard = { step: 'preview', preview: result };
		} catch (err) {
			error = readableApiErrorMessage(err, 'File tidak bisa diproses');
		}
	}

	async function handleCommit() {
		if (wizard.step !== 'preview') return;
		error = null;
		try {
			const result = await commit.mutateAsync({
				batchId: wizard.preview.batchId,
				selectedIndexes: [...selected],
				duplicatePolicy: policy
			});
			wizard = { step: 'done', result };
		} catch (err) {
			error = readableApiErrorMessage(err, 'Commit import gagal');
		}
	}

	function toggle(index: number) {
		if (selected.has(index)) selected.delete(index);
		else selected.add(index);
	}
</script>

<Dialog.Content class="sm:max-w-2xl">
	{#if wizard.step === 'upload'}
		<Dialog.Header>
			<Dialog.Title>Import referensi</Dialog.Title>
			<Dialog.Description>
				Ekspor koleksi dari Mendeley atau Zotero sebagai BibTeX (.bib) atau RIS (.ris), lalu unggah
				di sini. Maks 10 MB per file.
			</Dialog.Description>
		</Dialog.Header>
		<label
			class={cn(
				'grid cursor-pointer place-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center transition-colors',
				dragOver ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
			)}
			ondragover={(event) => {
				event.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={(event) => {
				event.preventDefault();
				dragOver = false;
				void handleFile(event.dataTransfer?.files?.[0]);
			}}
		>
			<Icon icon={UploadIcon} class="size-5 text-muted-foreground" />
			<span class="text-[13px] font-semibold text-foreground">
				{preview.isPending ? 'Memproses file…' : 'Letakkan file .bib/.ris atau klik untuk memilih'}
			</span>
			<input
				type="file"
				accept=".bib,.ris,.txt"
				class="hidden"
				disabled={preview.isPending}
				onchange={(event) => void handleFile(event.currentTarget.files?.[0])}
			/>
		</label>
		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
	{:else if wizard.step === 'preview'}
		<CitationImportPreviewStep
			preview={wizard.preview}
			{selected}
			onToggle={toggle}
			{policy}
			onPolicyChange={(p) => (policy = p)}
			{error}
			pending={commit.isPending}
			onBack={() => (wizard = { step: 'upload' })}
			onCommit={handleCommit}
		/>
	{:else}
		<Dialog.Header>
			<Dialog.Title>Import selesai</Dialog.Title>
			<Dialog.Description>
				{wizard.result.created} dibuat · {wizard.result.merged} digabung · {wizard.result.skipped}
				dilewati.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button
				type="button"
				onclick={() => {
					onOpenChange(false);
					onDone();
				}}
			>
				Lihat di Sitasi
			</Button>
		</Dialog.Footer>
	{/if}
</Dialog.Content>
