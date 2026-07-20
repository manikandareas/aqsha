<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { useClerkContext } from 'svelte-clerk';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Resizable from '@aqsha/ui-svelte/components/resizable';
	import * as Sheet from '@aqsha/ui-svelte/components/sheet';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import * as ToggleGroup from '@aqsha/ui-svelte/components/toggle-group';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { PageTitle } from '$lib/seo';
	import { Spinner } from '$lib/components/ui/spinner';
	import { queryKeys } from '$lib/query';
	import { readableApiErrorMessage } from '$lib/errors/api-error';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import {
		Icon,
		ArrowLeftIcon,
		ChevronDownIcon,
		Code2Icon,
		DownloadIcon,
		FileTextIcon,
		Library,
		MessageSquareIcon,
		MoreHorizontalIcon
	} from '$lib/icons';
	import ProjectChatPane from '../components/ProjectChatPane.svelte';
	import ProjectHeader from '../components/ProjectHeader.svelte';
	import ProjectSourcesPanel from '../components/ProjectSourcesPanel.svelte';
	import { useWorkspace } from '../api';
	import { projectDisplayTitle } from '../types';
	import TypstSourceEditor from '$lib/features/document/components/TypstSourceEditor.svelte';
	import TypstPreview from '$lib/features/document/components/TypstPreview.svelte';
	import TocOverlay from '$lib/features/document/components/TocOverlay.svelte';
	import ProposalReviewCard from '$lib/features/document/components/ProposalReviewCard.svelte';
	import AnnotationQueuePanel from '$lib/features/document/components/AnnotationQueuePanel.svelte';
	import AnnotationComposerDialog from '$lib/features/document/components/AnnotationComposerDialog.svelte';
	import { TypstClient } from '$lib/features/document/typst/client';
	import type { Cm6Diagnostic } from '$lib/features/document/typst/diagnostics';
	import { parseDocumentOutline, type DocumentOutlineEntry } from '$lib/features/document/lib/outline';
	import {
		insertSection,
		moveSection,
		removeSection,
		renameSection
	} from '$lib/features/document/lib/section-transforms';
	import { AutosaveController } from '$lib/features/document/lib/autosave-controller.svelte';
	import { buildAnnotationClientContext } from '$lib/features/document/lib/annotation-context';
	import type { AnnotationDraft } from '$lib/features/document/lib/annotation-selection';
	import {
		useWorkspaceDocument,
		useSaveWorkspaceDocument,
		useWorkspaceBib,
		useExportPdf,
		useExportDocx,
		useWorkspaceAnnotations,
		useCreateAnnotation,
		useUpdateAnnotation,
		useDeleteAnnotation,
		useMarkAnnotationsSent,
		usePendingProposal,
		useAcceptProposal,
		useRejectProposal,
		type TypstCompileError
	} from '$lib/features/document/api';

	/**
	 * Rumah proyek dokumen-tunggal: kiri tab Chat|Editor, kanan preview Typst realtime + TOC. Buffer
	 * editor = source-of-truth; preview di-compile di worker (client-side), diagnostik → lint editor.
	 * Loop Astra (anotasi → proposal per-hunk) diretarget ke level dokumen; proposal diterima →
	 * dokumen di-reseed dari server (bump docKey).
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));
	const qc = useQueryClient();

	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const documentQuery = useWorkspaceDocument(
		() => workspaceId,
		() => enabled
	);
	const bibQuery = useWorkspaceBib(
		() => workspaceId,
		() => enabled
	);
	const saveDocument = useSaveWorkspaceDocument(() => workspaceId);
	const annotations = useWorkspaceAnnotations(
		() => workspaceId,
		() => enabled
	);
	const createAnnotation = useCreateAnnotation(() => workspaceId);
	const updateAnnotation = useUpdateAnnotation(() => workspaceId);
	const deleteAnnotation = useDeleteAnnotation(() => workspaceId);
	const markSent = useMarkAnnotationsSent(() => workspaceId);
	const proposal = usePendingProposal(
		() => workspaceId,
		() => enabled
	);
	const acceptProposal = useAcceptProposal(() => workspaceId);
	const rejectProposal = useRejectProposal(() => workspaceId);
	const exportPdf = useExportPdf(() => workspaceId);
	const exportDocx = useExportDocx(() => workspaceId);

	$effect(() => {
		const w = workspace.data;
		if (!w) return;
		mentions.syncAmbientFromPage([
			{ kind: 'workspace', workspaceId: w.id, label: projectDisplayTitle(w) }
		]);
	});

	// ── Sumber + autosave + preview ──────────────────────────────────────────
	let source = $state('');
	let autosave = $state<AutosaveController | null>(null);
	let reloadNonce = $state(0);
	const docKey = $derived(`${workspaceId}:${reloadNonce}`);
	let editorRef = $state<TypstSourceEditor | null>(null);
	let previewRef = $state<TypstPreview | null>(null);

	// Seed sekali saat dokumen termuat; setelah itu buffer editor = source-of-truth.
	$effect(() => {
		const doc = documentQuery.data;
		if (!doc || autosave) return;
		source = doc.source;
		autosave = new AutosaveController({
			initialVersion: doc.contentVersion,
			save: (input) => saveDocument.mutateAsync(input)
		});
	});

	// Worker preview: satu client per halaman; hasil compile → vektor + diagnostik lint.
	let typstClient = $state<TypstClient | null>(null);
	let previewVector = $state<Uint8Array | null>(null);
	let diagnostics = $state<Cm6Diagnostic[]>([]);
	$effect(() => {
		if (!browser) return;
		const client = new TypstClient();
		client.onCompiled((r) => {
			if (r.vector) previewVector = r.vector;
			diagnostics = r.diagnostics;
		});
		typstClient = client;
		return () => {
			client.dispose();
			typstClient = null;
		};
	});

	// Dorong sumber terbaru + bib ke worker (client men-debounce). Reaktif atas source/bib/client.
	$effect(() => {
		const s = source;
		const b = bibQuery.data?.bib ?? '';
		typstClient?.update(s, b);
	});

	const outline = $derived(parseDocumentOutline(source));

	onDestroy(() => {
		const controller = autosave;
		if (controller) void controller.flush().finally(() => controller.dispose());
	});

	function onEditorChange(next: string): void {
		source = next;
		autosave?.edit(next);
	}

	// Terapkan hasil transformasi bab: lewat editor (edit user) bila termuat; jika belum, ubah buffer
	// langsung supaya editor menyeratkan sumber terbaru saat mount.
	function applyTransform(next: string): void {
		if (editorRef) editorRef.applyUserEdit(next);
		else {
			source = next;
			autosave?.edit(next);
		}
	}

	function navigateOutline(entry: DocumentOutlineEntry): void {
		previewRef?.scrollToHeading(entry.title);
		editorRef?.scrollToLine(entry.sourceLine);
	}

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
				return '';
		}
	});

	// Muat ulang dokumen dari server (setelah proposal diterima / konflik stale): reseed buffer +
	// reset controller + bump docKey supaya editor menampilkan sumber terbaru.
	async function reloadFromServer(): Promise<void> {
		const res = await documentQuery.refetch();
		const doc = res.data;
		if (!doc) return;
		source = doc.source;
		autosave?.reset(doc.contentVersion);
		reloadNonce += 1;
		void bibQuery.refetch();
	}

	// ── Anotasi ────────────────────────────────────────────────────────────
	const selectedAnnotationIds = new SvelteSet<string>();
	let activeAnnotationId = $state<string | null>(null);
	let pendingDraft = $state<AnnotationDraft | null>(null);
	let queueOpen = $state(false);
	const openAnnotationCount = $derived(
		(annotations.data ?? []).filter((a) => a.status === 'open').length
	);

	function onPreviewAnnotate(draft: AnnotationDraft): void {
		pendingDraft = draft;
	}

	function submitAnnotation(note: string): void {
		const draft = pendingDraft;
		if (!draft) return;
		pendingDraft = null;
		createAnnotation.mutate(
			{
				kind: 'highlight',
				page: draft.page,
				rects: draft.rects,
				selectedText: draft.selectedText,
				note: note || undefined
			},
			{ onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menyimpan anotasi.')) }
		);
	}

	function toggleSelected(id: string): void {
		if (selectedAnnotationIds.has(id)) selectedAnnotationIds.delete(id);
		else selectedAnnotationIds.add(id);
	}

	function dismissAnnotation(id: string): void {
		selectedAnnotationIds.delete(id);
		updateAnnotation.mutate({ annotationId: id, status: 'dismissed' });
	}

	function removeAnnotation(id: string): void {
		selectedAnnotationIds.delete(id);
		deleteAnnotation.mutate(id);
	}

	function focusAnnotation(id: string): void {
		activeAnnotationId = id;
		const target = (annotations.data ?? []).find((a) => a.id === id);
		if (target?.selectedText) previewRef?.scrollToHeading(target.selectedText);
	}

	function annotationContextParts(): string[] {
		const chosen = (annotations.data ?? []).filter(
			(a) => a.status === 'open' && selectedAnnotationIds.has(a.id)
		);
		if (chosen.length === 0) return [];
		return [buildAnnotationClientContext({ annotations: chosen })];
	}

	function handleTurnSent(threadId: string): void {
		const ids = [...selectedAnnotationIds];
		if (ids.length === 0) return;
		selectedAnnotationIds.clear();
		markSent.mutate({ ids, threadId });
	}

	function handleAgentSettled(): void {
		proposalAcceptErrors = null;
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId) });
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId) });
	}

	// ── Proposal ─────────────────────────────────────────────────────────────
	let proposalAcceptErrors = $state<TypstCompileError[] | null>(null);

	function handleAcceptProposal(acceptedHunkIndexes: number[] | undefined): void {
		const p = proposal.data;
		if (!p) return;
		proposalAcceptErrors = null;
		acceptProposal.mutate(
			{ proposalId: p.id, acceptedHunkIndexes },
			{
				onSuccess: (res) => {
					if (res.status === 'accepted') {
						toast.success('Suntingan diterapkan.');
						void reloadFromServer();
					} else if (res.status === 'compile_error') {
						proposalAcceptErrors = res.compileErrors;
						toast.warning('Hasil pilihan hunk gagal compile. Ubah pilihan atau tolak.');
					} else {
						toast.warning('Sumber sudah berubah — usulan dibatalkan. Minta Astra menyusun ulang.');
					}
				},
				onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menerapkan usulan.'))
			}
		);
	}

	function handleRejectProposal(): void {
		const p = proposal.data;
		if (!p) return;
		proposalAcceptErrors = null;
		rejectProposal.mutate(p.id, {
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menolak usulan.'))
		});
	}

	// ── Ekspor ─────────────────────────────────────────────────────────────
	function triggerDownload(url: string): void {
		const a = window.document.createElement('a');
		a.href = url;
		a.download = '';
		a.rel = 'noopener';
		window.document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function downloadPdf(): void {
		exportPdf.mutate(undefined, {
			onSuccess: (r) => triggerDownload(r.url),
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal mengekspor PDF.'))
		});
	}

	function downloadDocx(): void {
		exportDocx.mutate(undefined, {
			onSuccess: (r) => triggerDownload(r.url),
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal mengekspor DOCX.'))
		});
	}

	// ── Layout ───────────────────────────────────────────────────────────────
	type LeftMode = 'chat' | 'editor';
	type MobileMode = LeftMode | 'preview';

	let host = $state<HTMLDivElement | null>(null);
	let measured = $state(false);
	let wide = $state(false);
	let leftMode = $state<LeftMode>('chat');
	let mobileMode = $state<MobileMode>('chat');
	let editorVisited = $state(false);
	let previewVisited = $state(false);
	let sourcesOpen = $state(false);
	let detailsOpen = $state(false);

	$effect(() => {
		if (!browser || !host) return;
		const el = host;
		const measure = () => {
			wide = el.clientWidth >= 900;
			if (wide) previewVisited = true;
			measured = true;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	function selectLeftMode(value: string): void {
		if (value !== 'chat' && value !== 'editor') return;
		leftMode = value;
		mobileMode = value;
		if (value === 'editor') editorVisited = true;
	}

	function selectMobileMode(value: string): void {
		if (value !== 'chat' && value !== 'editor' && value !== 'preview') return;
		mobileMode = value;
		if (value !== 'preview') leftMode = value;
		if (value === 'editor') editorVisited = true;
		if (value === 'preview') previewVisited = true;
	}

	const editable = $derived(autosave?.status !== 'stale');
</script>

{#snippet chatPanel()}
	<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
		{#if openAnnotationCount > 0}
			<div class="shrink-0 border-b border-border px-3 py-1.5">
				<Collapsible.Root open={queueOpen} onOpenChange={(v) => (queueOpen = v)}>
					<Collapsible.Trigger
						class="flex w-full items-center gap-2 rounded-md py-1 text-label text-muted-foreground transition-colors hover:text-foreground"
					>
						<Icon
							icon={ChevronDownIcon}
							class="size-3.5 transition-transform {queueOpen ? 'rotate-180' : ''}"
						/>
						<span class="font-medium">Anotasi ({openAnnotationCount})</span>
						{#if selectedAnnotationIds.size > 0}
							<span class="text-micro">· {selectedAnnotationIds.size} akan dikirim bersama pesan</span>
						{/if}
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="pb-2 pt-1">
							<AnnotationQueuePanel
								annotations={annotations.data ?? []}
								selectedIds={selectedAnnotationIds}
								onToggle={toggleSelected}
								onDismiss={dismissAnnotation}
								onDelete={removeAnnotation}
								onFocus={focusAnnotation}
							/>
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		{/if}
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ProjectChatPane
				{workspaceId}
				getExtraClientContext={annotationContextParts}
				onTurnSent={handleTurnSent}
				onAgentSettled={handleAgentSettled}
			/>
		</div>
	</div>
{/snippet}

{#snippet editorPanel()}
	<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
		{#if proposal.data}
			<div class="shrink-0 border-b border-border p-3">
				<ProposalReviewCard
					proposal={proposal.data}
					accepting={acceptProposal.isPending}
					acceptErrors={proposalAcceptErrors}
					onAccept={handleAcceptProposal}
					onReject={handleRejectProposal}
				/>
			</div>
		{/if}
		{#if autosave?.status === 'stale'}
			<div
				class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-lemon/20 px-3 py-2 text-label"
				role="status"
			>
				<span>Sumber berubah di tempat lain. Muat ulang sebelum menyunting.</span>
				<Button type="button" size="sm" variant="secondary" onclick={reloadFromServer}>
					Muat ulang
				</Button>
			</div>
		{/if}
		<div class="min-h-0 flex-1">
			<TypstSourceEditor
				bind:this={editorRef}
				value={source}
				{docKey}
				{editable}
				{diagnostics}
				onChange={onEditorChange}
			/>
		</div>
		{#if saveStatusLabel}
			<div
				class="shrink-0 border-t border-border px-3 py-1 text-right text-micro text-muted-foreground"
				aria-live={autosave?.status === 'error' || autosave?.status === 'stale'
					? 'assertive'
					: 'polite'}
			>
				{saveStatusLabel}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet previewPanel()}
	<div class="relative flex h-full min-h-0 flex-col overflow-hidden">
		<TypstPreview
			bind:this={previewRef}
			vector={previewVector}
			annotations={annotations.data ?? []}
			{activeAnnotationId}
			onAnnotate={onPreviewAnnotate}
			onSelectAnnotation={(id) => (activeAnnotationId = id)}
		/>
		<TocOverlay
			{outline}
			onNavigate={navigateOutline}
			onInsert={(afterIndex, title) => applyTransform(insertSection(source, afterIndex, title))}
			onMove={(from, to) => applyTransform(moveSection(source, from, to))}
			onRename={(index, title) => applyTransform(renameSection(source, index, title))}
			onRemove={(index) => applyTransform(removeSection(source, index))}
		/>
	</div>
{/snippet}

{#if workspace.data}
	<PageTitle title={projectDisplayTitle(workspace.data)} />
{/if}

{#if workspace.isPending || documentQuery.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else if !workspace.data}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{:else}
	<div bind:this={host} class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
		<header
			class="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-border bg-card px-3 py-2"
		>
			<Button
				href={resolve('/app/(product)')}
				variant="ghost"
				size="icon"
				aria-label="Kembali ke daftar proyek"
			>
				<Icon icon={ArrowLeftIcon} class="size-4" />
			</Button>
			<span aria-hidden="true" class="text-lg leading-none">
				{workspace.data.emoji?.trim() || '📚'}
			</span>
			<div class="mr-auto min-w-0">
				<h1 class="max-w-72 truncate font-heading text-base font-bold">
					{projectDisplayTitle(workspace.data)}
				</h1>
			</div>

			{#if measured}
				{#if wide}
					<ToggleGroup.Root
						type="single"
						value={leftMode}
						onValueChange={selectLeftMode}
						aria-label="Panel kerja kiri"
					>
						<ToggleGroup.Item value="chat">
							<Icon icon={MessageSquareIcon} class="size-3.5" /> Chat
						</ToggleGroup.Item>
						<ToggleGroup.Item value="editor">
							<Icon icon={Code2Icon} class="size-3.5" /> Editor
							{#if proposal.data}
								<span
									aria-hidden="true"
									class="ml-1 size-2 rounded-full bg-primary"
									title="Usulan Astra menunggu"
								></span>
							{/if}
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{:else}
					<ToggleGroup.Root
						type="single"
						value={mobileMode}
						onValueChange={selectMobileMode}
						aria-label="Panel workspace"
					>
						<ToggleGroup.Item value="chat">
							<Icon icon={MessageSquareIcon} class="size-3.5" /> Chat
						</ToggleGroup.Item>
						<ToggleGroup.Item value="editor">
							<Icon icon={Code2Icon} class="size-3.5" /> Editor
						</ToggleGroup.Item>
						<ToggleGroup.Item value="preview">
							<Icon icon={FileTextIcon} class="size-3.5" /> Preview
						</ToggleGroup.Item>
					</ToggleGroup.Root>
				{/if}
			{/if}

			<Button type="button" variant="outline" size="sm" onclick={() => (sourcesOpen = true)}>
				<Icon icon={Library} class="size-4" />
				<span class="hidden sm:inline">Sumber</span>
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="ghost" size="icon" aria-label="Menu proyek">
							<Icon icon={MoreHorizontalIcon} class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item disabled={exportPdf.isPending} onSelect={downloadPdf}>
						<Icon icon={DownloadIcon} class="size-4" /> Unduh PDF
					</DropdownMenu.Item>
					<DropdownMenu.Item disabled={exportDocx.isPending} onSelect={downloadDocx}>
						<Icon icon={DownloadIcon} class="size-4" /> Unduh DOCX
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => (detailsOpen = true)}>Detail proyek</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</header>

		{#if !measured}
			<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
				<Spinner class="size-4" />
				<span class="text-sm">Menyiapkan workspace…</span>
			</div>
		{:else if wide}
			<Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
				<Resizable.Pane defaultSize={44} minSize={28}>
					<div class="flex h-full min-h-0 flex-col overflow-hidden">
						<div
							class={leftMode === 'chat' ? 'contents' : 'hidden'}
							aria-hidden={leftMode !== 'chat'}
						>
							{@render chatPanel()}
						</div>
						{#if editorVisited}
							<div
								class={leftMode === 'editor' ? 'contents' : 'hidden'}
								aria-hidden={leftMode !== 'editor'}
							>
								{@render editorPanel()}
							</div>
						{/if}
					</div>
				</Resizable.Pane>
				<Resizable.Handle withHandle aria-label="Ubah lebar panel kerja dan preview" />
				<Resizable.Pane defaultSize={56} minSize={34}>
					{@render previewPanel()}
				</Resizable.Pane>
			</Resizable.PaneGroup>
		{:else}
			<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class={mobileMode === 'chat' ? 'contents' : 'hidden'} aria-hidden={mobileMode !== 'chat'}>
					{@render chatPanel()}
				</div>
				{#if editorVisited}
					<div
						class={mobileMode === 'editor' ? 'contents' : 'hidden'}
						aria-hidden={mobileMode !== 'editor'}
					>
						{@render editorPanel()}
					</div>
				{/if}
				{#if previewVisited}
					<div
						class={mobileMode === 'preview' ? 'contents' : 'hidden'}
						aria-hidden={mobileMode !== 'preview'}
					>
						{@render previewPanel()}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<Sheet.Root bind:open={sourcesOpen}>
		<Sheet.Content side="right" class="gap-0 p-0 sm:max-w-[30rem]">
			<Sheet.Header class="border-b-2 border-border px-5 py-4">
				<Sheet.Title>Sumber proyek</Sheet.Title>
				<Sheet.Description>Sumber perpustakaan yang tertaut ke proyek ini.</Sheet.Description>
			</Sheet.Header>
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<ProjectSourcesPanel {workspaceId} />
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<Sheet.Root bind:open={detailsOpen}>
		<Sheet.Content side="right" class="gap-0 p-0 sm:max-w-[32rem]">
			<Sheet.Header class="sr-only">
				<Sheet.Title>Detail proyek</Sheet.Title>
				<Sheet.Description>Ubah judul, info, dan tenggat proyek.</Sheet.Description>
			</Sheet.Header>
			<div class="min-h-0 flex-1 overflow-y-auto pt-12">
				<ProjectHeader workspace={workspace.data} />
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<AnnotationComposerDialog
		open={pendingDraft !== null}
		excerpt={pendingDraft?.selectedText ?? null}
		onSubmit={submitAnnotation}
		onCancel={() => (pendingDraft = null)}
	/>
{/if}
