<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { FolderIcon, Icon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';
	import { cn } from '$lib/utils';
	import {
		type IntegrationProviderKey,
		PROVIDER_META
	} from '$lib/features/settings/lib/integrations';
	import { useProviderFolders, useProviderSyncCommit, useProviderSyncPreview } from '../api';
	import type { ImportCommitResult, ImportDuplicatePolicy, ImportPreviewResult } from '../types';
	import CitationImportPreviewStep from './CitationImportPreviewStep.svelte';

	type WizardStep =
		| { step: 'folder' }
		| { step: 'preview'; preview: ImportPreviewResult }
		| { step: 'done'; result: ImportCommitResult };

	let {
		workspaceId,
		provider,
		providers,
		onProviderChange,
		onOpenChange,
		onDone
	}: {
		workspaceId: string;
		provider: IntegrationProviderKey;
		providers: IntegrationProviderKey[];
		onProviderChange: (provider: IntegrationProviderKey) => void;
		onOpenChange: (open: boolean) => void;
		onDone: () => void;
	} = $props();

	let wizard = $state<WizardStep>({ step: 'folder' });
	let error = $state<string | null>(null);
	let folderId = $state<string | null>(null);
	const selected = new SvelteSet<number>();
	let policy = $state<ImportDuplicatePolicy>('merge');

	const folders = useProviderFolders(
		() => provider,
		() => wizard.step === 'folder'
	);
	const preview = useProviderSyncPreview(
		() => workspaceId,
		() => provider
	);
	const commit = useProviderSyncCommit(
		() => workspaceId,
		() => provider
	);

	async function handlePreview() {
		error = null;
		try {
			const result = await preview.mutateAsync({ folderId });
			selected.clear();
			for (const r of result.records) selected.add(r.index);
			wizard = { step: 'preview', preview: result };
		} catch (err) {
			error = readableApiErrorMessage(err, 'Gagal menarik referensi');
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
			error = readableApiErrorMessage(err, 'Commit sinkron gagal');
		}
	}

	function toggle(index: number) {
		if (selected.has(index)) selected.delete(index);
		else selected.add(index);
	}
</script>

{#snippet folderOption(label: string, active: boolean, onSelect: () => void)}
	<button
		type="button"
		onclick={onSelect}
		class={cn(
			'flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-[13px] font-medium last:border-b-0 hover:bg-muted/40',
			active ? 'bg-muted/60 text-foreground' : 'text-muted-foreground'
		)}
	>
		<Icon icon={FolderIcon} class="size-3.5 shrink-0" />
		<span class="truncate">{label}</span>
	</button>
{/snippet}

{#if wizard.step === 'preview'}
	<Dialog.Content class="sm:max-w-2xl">
		<CitationImportPreviewStep
			preview={wizard.preview}
			title="Preview sinkron"
			backLabel="Ganti folder"
			{selected}
			onToggle={toggle}
			{policy}
			onPolicyChange={(p) => (policy = p)}
			{error}
			pending={commit.isPending}
			onBack={() => (wizard = { step: 'folder' })}
			onCommit={handleCommit}
		/>
	</Dialog.Content>
{:else if wizard.step === 'done'}
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Sinkron selesai</Dialog.Title>
			<Dialog.Description>
				{wizard.result.created} dibuat · {wizard.result.merged} diperbarui · {wizard.result.skipped}
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
	</Dialog.Content>
{:else}
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Tarik dari {PROVIDER_META[provider].label}</Dialog.Title>
			<Dialog.Description>
				Pilih folder untuk melihat pratinjau referensi sebelum menambahkannya.
			</Dialog.Description>
		</Dialog.Header>

		{#if providers.length > 1}
			<label class="grid gap-1.5">
				<span class="text-[12px] font-semibold text-foreground">Akun</span>
				<select
					value={provider}
					onchange={(event) =>
						onProviderChange(event.currentTarget.value as IntegrationProviderKey)}
					class="h-9 rounded-lg border border-border bg-background px-3 text-[13px]"
				>
					{#each providers as p (p)}
						<option value={p}>{PROVIDER_META[p].label}</option>
					{/each}
				</select>
			</label>
		{/if}

		<div class="grid gap-1.5">
			<span class="text-[12px] font-semibold text-foreground">Folder</span>
			<div class="max-h-[40vh] overflow-y-auto rounded-lg border border-border/70">
				{@render folderOption('Semua referensi', folderId === null, () => (folderId = null))}
				{#if folders.isLoading}
					<p class="px-3 py-2 text-[12px] font-medium text-muted-foreground">Memuat folder…</p>
				{:else}
					{#each folders.data ?? [] as folder (folder.id)}
						{@render folderOption(
							folder.name,
							folderId === folder.id,
							() => (folderId = folder.id)
						)}
					{/each}
				{/if}
			</div>
		</div>

		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)}>Batal</Button>
			<Button type="button" onclick={handlePreview} disabled={preview.isPending}>
				{preview.isPending ? 'Menarik…' : 'Pratinjau'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
{/if}
