<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, UploadIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { readableApiErrorMessage } from '$lib/errors';
	import { useFileDropzone } from '../hooks/use-file-dropzone.svelte';
	import { WORKSPACE_UPLOAD_ACCEPT } from '../utils/workspace-file-upload';

	/**
	 * Inner content of {@link AddItemDialog} — mounted only while open. Add a link (URL ingestion) or
	 * upload PDFs; uploads hand off to the board's queue (toast + progress) and close the dialog.
	 */
	let {
		folderName,
		onOpenChange,
		onSubmit,
		onUploadFiles
	}: {
		folderName?: string;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { url: string; title?: string }) => Promise<unknown>;
		onUploadFiles: (files: File[]) => void;
	} = $props();

	let url = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	const destination = $derived(folderName?.trim());

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!url.trim()) return;
		isSubmitting = true;
		error = null;
		try {
			await onSubmit({ url: url.trim() });
			url = '';
			onOpenChange(false);
			isSubmitting = false;
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, 'Aksi gagal.');
			isSubmitting = false;
		}
	}

	// Upload reuses the board's queue (toast + progress), so we hand files off and close.
	function handleFiles(files: FileList | null) {
		const list = files ? [...files] : [];
		if (list.length === 0) return;
		onUploadFiles(list);
		onOpenChange(false);
	}

	const dropzone = useFileDropzone((files) => handleFiles(files));
</script>

<Dialog.Content class="gap-5 sm:max-w-lg">
	<Dialog.Header>
		<Dialog.Title>{destination ? `Add item to ${destination}` : 'Add item'}</Dialog.Title>
		<Dialog.Description>
			At the moment you can add research as .PDFs or webpages. Links from popular research sharing
			sites are automatically downloaded as PDFs.
		</Dialog.Description>
	</Dialog.Header>

	<form class="flex items-start gap-2" onsubmit={handleSubmit}>
		<div class="flex-1">
			<Input
				autofocus
				bind:value={url}
				placeholder="https://arxiv.org/abs/1304.0445"
				type="url"
				inputmode="url"
			/>
			{#if error}
				<p class="mt-1.5 text-[12px] font-medium text-destructive">{error}</p>
			{/if}
		</div>
		<Button type="submit" disabled={!url.trim() || isSubmitting}>
			{isSubmitting ? 'Adding…' : 'Add link'}
		</Button>
	</form>

	<div class="flex items-center gap-3 text-[12px] font-medium text-muted-foreground">
		<span class="h-px flex-1 bg-border"></span>
		<span class="shrink-0">or import a .pdf file from your computer</span>
		<span class="h-px flex-1 bg-border"></span>
	</div>

	<div
		{...dropzone.dropzoneProps}
		class={cn(
			'grid place-items-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center transition-colors',
			dropzone.isDragOver && 'border-primary/50 bg-primary/5'
		)}
	>
		<p class="text-[13px] font-medium text-muted-foreground">Drag &amp; drop .pdf files to add</p>
		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			accept={WORKSPACE_UPLOAD_ACCEPT}
			class="sr-only"
			aria-label="Pilih file untuk diunggah"
			onchange={(event) => {
				handleFiles(event.currentTarget.files);
				event.currentTarget.value = '';
			}}
		/>
		<Button type="button" onclick={() => fileInputEl?.click()}>
			<Icon icon={UploadIcon} class="size-4" />
			Click to select
		</Button>
	</div>
</Dialog.Content>
