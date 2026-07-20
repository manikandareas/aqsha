<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SECTION_STATUS_LABELS } from '$lib/features/workspaces/labels';
	import type { WorkspaceSection } from '$lib/features/workspaces/types';
	import { useSaveSectionDocument, useSectionDocument } from '../api';
	import { AutosaveController } from '../lib/autosave-controller.svelte';
	import type { LatexEditorHandle } from '../lib/latex-editor';
	import LatexSourceEditor from './LatexSourceEditor.svelte';

	let {
		workspaceId,
		section,
		active = false,
		onActivate
	}: {
		workspaceId: string;
		section: WorkspaceSection;
		active?: boolean;
		onActivate: (sectionId: string) => void;
	} = $props();

	const sectionDocument = useSectionDocument(() => section.id);
	const saveDocument = useSaveSectionDocument(
		() => section.id,
		() => workspaceId
	);

	let autosave = $state<AutosaveController | null>(null);
	let editorHandle = $state<LatexEditorHandle | null>(null);
	let initialized = $state(false);
	const docKey = $derived(`${section.id}:${sectionDocument.data?.contentVersion ?? 0}`);

	$effect(() => {
		if (initialized || sectionDocument.isPending || sectionDocument.isError) return;
		autosave = new AutosaveController({
			initialVersion: sectionDocument.data?.contentVersion ?? 0,
			save: (input) => saveDocument.mutateAsync(input)
		});
		initialized = true;
	});

	onDestroy(() => {
		const controller = autosave;
		if (!controller) return;
		// Route changes may destroy the canvas while a debounced edit is still pending.
		void controller.flush().finally(() => controller.dispose());
	});

	const saveStatusLabel = $derived.by(() => {
		switch (autosave?.status) {
			case 'saving':
				return 'Menyimpan…';
			case 'saved':
				return 'Tersimpan';
			case 'dirty':
				return 'Belum disimpan';
			case 'stale':
				return 'Berubah di tempat lain';
			case 'error':
				return 'Gagal menyimpan';
			default:
				return 'Siap ditulis';
		}
	});

	async function reloadSource(): Promise<void> {
		const result = await sectionDocument.refetch();
		const fresh = result.data;
		autosave?.reset(fresh?.contentVersion ?? 0);
		editorHandle?.setDoc(fresh?.source ?? '');
	}
</script>

<section
	id={`workspace-section-${section.id}`}
	data-section-id={section.id}
	class="scroll-mt-12 border-b border-border bg-background last:border-b-0"
	aria-labelledby={`workspace-section-heading-${section.id}`}
>
	<header
		class="sticky top-0 z-10 flex min-h-11 flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2"
	>
		<button
			type="button"
			class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			aria-current={active ? 'true' : undefined}
			onclick={() => onActivate(section.id)}
		>
			<h2
				id={`workspace-section-heading-${section.id}`}
				class="truncate font-heading text-base font-bold"
			>
				{section.title}
			</h2>
		</button>
		<Badge variant="outline">{SECTION_STATUS_LABELS[section.status]}</Badge>
		<span
			class="text-label text-muted-foreground"
			aria-live={autosave?.status === 'error' || autosave?.status === 'stale'
				? 'assertive'
				: 'polite'}
		>
			{saveStatusLabel}
		</span>
	</header>

	{#if sectionDocument.isPending}
		<div class="flex min-h-64 items-center justify-center gap-2 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat sumber bab…</span>
		</div>
	{:else if sectionDocument.isError}
		<div class="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
			<p class="text-sm text-muted-foreground">Sumber bab tidak dapat dimuat.</p>
			<Button type="button" variant="outline" size="sm" onclick={() => sectionDocument.refetch()}>
				Coba lagi
			</Button>
		</div>
	{:else}
		{#if autosave?.status === 'stale'}
			<div
				class="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-2 border-border bg-lemon/20 px-3 py-2 text-label"
				role="status"
			>
				<span>Sumber berubah di tempat lain. Muat ulang sebelum melanjutkan.</span>
				<Button type="button" size="sm" variant="secondary" onclick={reloadSource}>
					Muat ulang
				</Button>
			</div>
		{/if}
		<div class="px-4 py-4">
			<div class="overflow-hidden rounded-lg border-2 border-border bg-card">
				<LatexSourceEditor
					value={sectionDocument.data?.source ?? ''}
					{docKey}
					layout="document"
					editable={autosave?.status !== 'stale'}
					onChange={(next) => autosave?.edit(next)}
					onReady={(handle) => (editorHandle = handle)}
				/>
			</div>
		</div>
	{/if}
</section>
