<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { useClerkContext } from 'svelte-clerk';
	import { useQueryClient } from '@tanstack/svelte-query';
	import {
		buildDocumentAnnotationMentionLabel,
		type ContextRef,
		MAX_CONTEXT_ANNOTATIONS
	} from '@aqsha/chat-core';
	import * as Resizable from '@aqsha/ui-svelte/components/resizable';
	import * as ToggleGroup from '@aqsha/ui-svelte/components/toggle-group';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { PageTitle } from '$lib/seo';
	import { Spinner } from '$lib/components/ui/spinner';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import { queryKeys } from '$lib/query';
	import { readableApiErrorMessage } from '$lib/errors/api-error';
	import {
		ComposerMentions,
		projectPageAmbientRefs,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import {
		Icon,
		Code2Icon,
		FileDownIcon,
		FileTextIcon,
		MessageSquareIcon
	} from '$lib/icons';
	import ProjectChatPane from '../components/ProjectChatPane.svelte';
	import ProjectChatRuntimeProvider from '../components/ProjectChatRuntimeProvider.svelte';
	import { useWorkspace } from '../api';
	import { resolveMainTypFilename } from '../main-typ-filename';
	import { projectDisplayTitle } from '../types';
	import TocOverlay from '$lib/features/document/components/TocOverlay.svelte';
	import AnnotationModeControls from '$lib/features/document/components/AnnotationModeControls.svelte';
	import ProposalReviewCard from '$lib/features/document/components/ProposalReviewCard.svelte';
	import {
		ProposalReviewInteractions,
		setProposalReviewInteractions
	} from '$lib/features/document/lib/proposal-review-interactions.svelte';
	import {
		insertSection,
		moveSection,
		removeSection,
		renameSection
	} from '$lib/features/document/lib/section-transforms';
	import { DocumentWorkspaceRuntime } from '$lib/features/document/lib/document-workspace-runtime.svelte';
	import type { AnnotationDraft } from '$lib/features/document/lib/annotation-selection';
	import {
		initialProjectActivation,
		reduceProjectActivation,
		type ProjectActivationEvent
	} from '../lib/project-activation';
	import {
		useWorkspaceDocument,
		useSaveWorkspaceDocument,
		useWorkspaceBib,
		useExportPdf,
		useWorkspaceAnnotations,
		useCreateAnnotation,
		useDismissWorkspaceAnnotations,
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
	let activation = $state.raw(initialProjectActivation());
	// Dispatch di-untrack: beberapa pemanggil hidup di dalam `$effect` (mis. measure layout);
	// membaca `activation` tracked lalu menulisnya kembali memicu effect_update_depth_exceeded.
	function dispatchActivation(event: ProjectActivationEvent): void {
		activation = reduceProjectActivation(
			untrack(() => activation),
			event
		);
	}
	const backgroundQueriesActive = $derived(enabled && activation.shellPainted);
	const documentQueriesActive = $derived(enabled && activation.documentRuntimeActive);
	const qc = useQueryClient();

	const mentions = new ComposerMentions();
	setComposerMentions(mentions);
	mentions.syncAmbientFromPage(projectPageAmbientRefs());
	const proposalReviewInteractions = new ProposalReviewInteractions();
	setProposalReviewInteractions(proposalReviewInteractions);

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const documentQuery = useWorkspaceDocument(
		() => workspaceId,
		() => documentQueriesActive
	);
	const bibQuery = useWorkspaceBib(
		() => workspaceId,
		() => documentQueriesActive
	);
	const saveDocument = useSaveWorkspaceDocument(() => workspaceId);
	const annotations = useWorkspaceAnnotations(
		() => workspaceId,
		() => backgroundQueriesActive
	);
	const createAnnotation = useCreateAnnotation(() => workspaceId);
	const dismissAnnotations = useDismissWorkspaceAnnotations(() => workspaceId);
	const markSent = useMarkAnnotationsSent(() => workspaceId);
	const proposal = usePendingProposal(
		() => workspaceId,
		() => backgroundQueriesActive
	);
	const acceptProposal = useAcceptProposal(() => workspaceId);
	const rejectProposal = useRejectProposal(() => workspaceId);
	const exportPdf = useExportPdf(() => workspaceId);

	$effect(() => {
		const current = proposal.data;
		proposalReviewInteractions.set(
			current
				? {
						proposalId: current.id,
						hunkCount: current.hunks?.length ?? 0,
						review: beginProposalReview
					}
				: null
		);
	});

	const runtime = new DocumentWorkspaceRuntime({
		workspaceId: () => workspaceId,
		mainTypFilename: () => resolveMainTypFilename(workspace.data?.kind),
		save: (input) => saveDocument.mutateAsync(input)
	});
	let editorRef = $state<{
		applyUserEdit(next: string): void;
		scrollToLine(line: number): void;
	} | null>(null);
	let previewRef = $state<{ scrollToHeading(title: string): void } | null>(null);

	$effect(() => {
		if (!activation.documentRuntimeActive) return;
		void runtime.loadModules();
	});

	$effect(() => {
		runtime.seedIfNeeded(documentQuery.data, documentQuery.isSuccess);
	});

	$effect(() => {
		return runtime.mountClient(activation.documentRuntimeActive, documentQuery.isSuccess);
	});

	$effect(() => {
		const s = runtime.source;
		const b = bibQuery.data?.bib ?? '';
		const path = runtime.mainFilePath;
		void s;
		void path;
		runtime.pushSource(b);
	});

	onDestroy(() => {
		void runtime.flushAndDispose();
	});

	async function reloadFromServer(): Promise<void> {
		const res = await documentQuery.refetch();
		const doc = res.data;
		if (!doc) return;
		runtime.applyServerDocument(doc);
		void bibQuery.refetch();
	}

	async function retryDocumentRuntime(): Promise<void> {
		await runtime.retryModules(
			() => documentQuery.refetch(),
			() => bibQuery.refetch()
		);
	}

	function retryPreview(): void {
		runtime.retryPreview(bibQuery.data?.bib ?? '', retryDocumentRuntime);
	}

	// ── Anotasi ────────────────────────────────────────────────────────────
	// Anotasi hidup sebagai chip di composer (selection channel), bukan antrian panel: buat dari
	// mode anotasi preview → chip; hapus chip = batal ikut kirim (anotasi tetap `open` di server).
	let activeAnnotationId = $state<string | null>(null);
	let activeTocIndex = $state(0);

	const selectedAnnotationIds = $derived(
		new Set(
			mentions.selectionRefs.flatMap((r) =>
				r.kind === 'document-annotation' ? [r.annotationId] : []
			)
		)
	);

	function handleCreateAnnotation(
		draft: AnnotationDraft,
		note: string,
		elementLabel: string
	): void {
		const canAddToComposer =
			mentions.selectionRefs.filter((r) => r.kind === 'document-annotation').length <
			MAX_CONTEXT_ANNOTATIONS;
		createAnnotation.mutate(
			{
				kind: 'pin',
				page: draft.page,
				rects: draft.rects,
				selectedText: draft.selectedText,
				note
			},
			{
				onSuccess: (a) => {
					if (!canAddToComposer) {
						toast.info(
							`Anotasi tersimpan. Lepas chip konteks untuk menambah lagi (maksimal ${MAX_CONTEXT_ANNOTATIONS}).`
						);
						return;
					}
					const selectedText = a.selectedText ?? draft.selectedText;
					mentions.addSelectionRef({
						kind: 'document-annotation',
						workspaceId,
						annotationId: a.id,
						page: a.page,
						selectedText,
						note: a.note ?? note,
						elementLabel,
						label: buildDocumentAnnotationMentionLabel(elementLabel, selectedText)
					});
				},
				onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menyimpan anotasi.'))
			}
		);
	}

	function focusAnnotation(id: string): void {
		activeAnnotationId = id;
		const target = (annotations.data ?? []).find((a) => a.id === id);
		if (target?.selectedText) previewRef?.scrollToHeading(target.selectedText);
	}

	function handleTurnSent(threadId: string, sentRefs: ContextRef[]): void {
		const ids = sentRefs.flatMap((r) => (r.kind === 'document-annotation' ? [r.annotationId] : []));
		if (ids.length === 0) return;
		markSent.mutate({ ids, threadId });
	}

	function handleAgentSettled(): void {
		proposalAcceptErrors = null;
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId) });
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId) });
	}

	// ── Proposal ─────────────────────────────────────────────────────────────
	let proposalAcceptErrors = $state<TypstCompileError[] | null>(null);
	let reviewingProposalId = $state<string | null>(null);
	const proposalHunkCount = $derived(proposal.data?.hunks?.length ?? 0);
	const reviewingProposal = $derived(
		reviewingProposalId !== null && reviewingProposalId === proposal.data?.id
	);

	function beginProposalReview(): void {
		const current = proposal.data;
		if (!current) return;
		reviewingProposalId = current.id;
		selectLeftMode('editor');
	}

	function exitProposalReview(): void {
		reviewingProposalId = null;
		proposalAcceptErrors = null;
	}

	function handleAcceptProposal(acceptedHunkIndexes: number[] | undefined): void {
		const p = proposal.data;
		if (!p) return;
		proposalAcceptErrors = null;
		acceptProposal.mutate(
			{ proposalId: p.id, acceptedHunkIndexes },
			{
				onSuccess: (res) => {
					if (res.status === 'accepted') {
						proposalReviewInteractions.set(null);
						toast.success('Suntingan diterapkan.');
						exitProposalReview();
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
			onSuccess: () => {
				proposalReviewInteractions.set(null);
				exitProposalReview();
			},
			onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menolak usulan.'))
		});
	}

	function requestProposalResubmit(): void {
		const current = proposal.data;
		if (!current) return;
		rejectProposal.mutate(current.id, {
			onSuccess: () => {
				proposalReviewInteractions.set(null);
				exitProposalReview();
				mentions.setComposerDraft(current.resubmitInstruction || current.summary);
				selectLeftMode('chat');
			},
			onError: (error) =>
				toast.error(readableApiErrorMessage(error, 'Gagal menyiapkan usulan ulang.'))
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
	let annotationMode = $state(false);

	const visibleAnnotationIds = $derived(
		(annotations.data ?? []).flatMap((annotation) =>
			annotation.status === 'open' || annotation.status === 'sent' ? [annotation.id] : []
		)
	);

	$effect(() => {
		if (!browser || !host) return;
		const el = host;
		const measure = () => {
			wide = el.clientWidth >= 900;
			dispatchActivation({ type: 'layout-measured', wide });
			if (wide) previewVisited = true;
			measured = true;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!browser || !workspace.data || !measured) return;
		// Guard shellPainted di-untrack: dispatch frame pertama mengubah `activation`; bila tracked,
		// effect re-run dan cleanup meng-cancel frame kedua sebelum `desktop-delay-complete` terkirim.
		if (untrack(() => activation.shellPainted)) return;
		let secondFrame = 0;
		const firstFrame = requestAnimationFrame(() => {
			dispatchActivation({ type: 'shell-painted' });
			secondFrame = requestAnimationFrame(() => {
				dispatchActivation({ type: 'desktop-delay-complete' });
			});
		});
		return () => {
			cancelAnimationFrame(firstFrame);
			if (secondFrame) cancelAnimationFrame(secondFrame);
		};
	});

	function activateDocumentRuntime(): void {
		dispatchActivation({ type: 'open-document-surface' });
	}

	function selectLeftMode(value: string): void {
		if (value !== 'chat' && value !== 'editor') return;
		leftMode = value;
		mobileMode = value;
		if (value === 'editor') {
			editorVisited = true;
			activateDocumentRuntime();
		}
	}

	function selectMobileMode(value: string): void {
		if (value !== 'chat' && value !== 'editor' && value !== 'preview') return;
		mobileMode = value;
		if (value !== 'preview') leftMode = value;
		if (value === 'editor') editorVisited = true;
		if (value === 'preview') previewVisited = true;
		if (value !== 'chat') activateDocumentRuntime();
	}
</script>

{#snippet leftToggle()}
	{@const toggleItemClass =
		'h-6 gap-1 rounded-md px-2 text-label font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground data-[state=on]:hover:bg-muted'}
	{#if wide}
		<ToggleGroup.Root
			type="single"
			value={leftMode}
			onValueChange={selectLeftMode}
			size="sm"
			spacing={0}
			class="border-0 bg-transparent p-0"
			aria-label="Panel kerja kiri"
		>
			<ToggleGroup.Item value="chat" class={toggleItemClass}>
				<Icon icon={MessageSquareIcon} class="size-3" /> Chat
			</ToggleGroup.Item>
			<ToggleGroup.Item
				value="editor"
				class={toggleItemClass}
				onpointerenter={() => runtime.preloadModules()}
				onfocus={() => runtime.preloadModules()}
			>
				<Icon icon={Code2Icon} class="size-3" /> Editor
				{#if proposalHunkCount > 0}
					<span class="rounded-full bg-primary px-1.5 text-micro leading-4 text-primary-foreground"
						>{proposalHunkCount}</span
					>
				{/if}
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	{:else}
		<ToggleGroup.Root
			type="single"
			value={mobileMode}
			onValueChange={selectMobileMode}
			size="sm"
			spacing={0}
			class="border-0 bg-transparent p-0"
			aria-label="Panel workspace"
		>
			<ToggleGroup.Item value="chat" class={toggleItemClass}>
				<Icon icon={MessageSquareIcon} class="size-3" /> Chat
			</ToggleGroup.Item>
			<ToggleGroup.Item
				value="editor"
				class={toggleItemClass}
				onpointerenter={() => runtime.preloadModules()}
				onfocus={() => runtime.preloadModules()}
			>
				<Icon icon={Code2Icon} class="size-3" /> Editor
				{#if proposalHunkCount > 0}
					<span class="rounded-full bg-primary px-1.5 text-micro leading-4 text-primary-foreground"
						>{proposalHunkCount}</span
					>
				{/if}
			</ToggleGroup.Item>
			<ToggleGroup.Item
				value="preview"
				class={toggleItemClass}
				onpointerenter={() => runtime.preloadModules()}
				onfocus={() => runtime.preloadModules()}
			>
				<Icon icon={FileTextIcon} class="size-3" /> Preview
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	{/if}
{/snippet}

{#snippet chatPanel()}
	<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ProjectChatPane leading={leftToggle} />
		</div>
	</div>
{/snippet}

{#snippet editorPanel()}
	<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
		<PanelCardToolbar title={leftToggle} />
		{#if reviewingProposal && proposal.data}
			<div class="min-h-0 flex-1 overflow-y-auto p-3">
				<ProposalReviewCard
					proposal={proposal.data}
					source={proposal.data.currentSource}
					accepting={acceptProposal.isPending}
					acceptErrors={proposalAcceptErrors}
					onAccept={handleAcceptProposal}
					onReject={handleRejectProposal}
					onExitReview={exitProposalReview}
					onResubmit={requestProposalResubmit}
				/>
			</div>
		{:else}
			{#if runtime.autosave?.status === 'stale'}
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
				{#if runtime.loadError || runtime.previewError || documentQuery.isError}
					<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
						<p class="text-sm text-destructive">
							{runtime.loadError ?? 'Dokumen gagal dimuat.'}
						</p>
						<Button type="button" size="sm" variant="outline" onclick={retryDocumentRuntime}>
							Coba lagi
						</Button>
					</div>
				{:else if !documentQuery.isSuccess || !runtime.Editor}
					<div class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
						<Spinner class="size-4" /> Menyiapkan editor…
					</div>
				{:else}
					{@const Editor = runtime.Editor}
					<Editor
						bind:this={editorRef}
						value={runtime.source}
						docKey={runtime.docKey}
						editable={runtime.editable}
						diagnostics={runtime.diagnostics}
						mainFilePath={runtime.mainFilePath}
						onChange={(next) => runtime.onEditorChange(next)}
					/>
				{/if}
			</div>
			{#if runtime.saveStatusLabel}
				<div
					class="shrink-0 border-t border-border px-3 py-1 text-right text-micro text-muted-foreground"
					aria-live={runtime.autosave?.status === 'error' || runtime.autosave?.status === 'stale'
						? 'assertive'
						: 'polite'}
				>
					{runtime.saveStatusLabel}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet previewPanel()}
	<div class="relative flex h-full min-h-0 flex-col overflow-hidden">
		<PanelCardToolbar>
			{#snippet title()}
				{#if !wide}{@render leftToggle()}{/if}
			{/snippet}
			{#snippet actions()}
				<div class="flex items-center gap-2" data-annotation-ui>
					<AnnotationModeControls
						bind:annotationMode
						visibleIds={visibleAnnotationIds}
						disabled={visibleAnnotationIds.length === 0}
						onDismiss={async (ids) => {
							await dismissAnnotations.mutateAsync({ ids });
						}}
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						class="shrink-0 gap-1"
						disabled={exportPdf.isPending}
						onclick={downloadPdf}
					>
						<Icon icon={FileDownIcon} class="size-3.5" />
						Download
					</Button>
				</div>
			{/snippet}
		</PanelCardToolbar>
		<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			{#if runtime.loadError || documentQuery.isError}
				<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
					<p class="text-sm text-destructive">
						{runtime.loadError ?? runtime.previewError ?? 'Preview dokumen gagal dimuat.'}
					</p>
					<Button type="button" size="sm" variant="outline" onclick={retryPreview}>
						Coba lagi
					</Button>
				</div>
			{:else if !activation.documentRuntimeActive || !documentQuery.isSuccess || !runtime.Preview}
				<div class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
					<Spinner class="size-4" /> Menyiapkan preview…
				</div>
			{:else}
				{@const Preview = runtime.Preview}
				<Preview
					bind:this={previewRef}
					bind:annotationMode
					svg={runtime.previewSvg}
					annotations={annotations.data ?? []}
					{activeAnnotationId}
					{selectedAnnotationIds}
					outlineTitles={runtime.outline.map((entry) => entry.title)}
					{proposalHunkCount}
					onReviewProposal={beginProposalReview}
					onCreateAnnotation={handleCreateAnnotation}
					onSelectAnnotation={focusAnnotation}
					onActiveHeading={(index: number) => (activeTocIndex = index)}
				/>
				<TocOverlay
					outline={runtime.outline}
					activeIndex={activeTocIndex}
					onNavigate={(entry) => runtime.navigateOutline(entry, editorRef, previewRef)}
					onInsert={(afterIndex, title) =>
						runtime.applyTransform(insertSection(runtime.source, afterIndex, title), editorRef)}
					onMove={(from, to) =>
						runtime.applyTransform(moveSection(runtime.source, from, to), editorRef)}
					onRename={(index, title) =>
						runtime.applyTransform(renameSection(runtime.source, index, title), editorRef)}
					onRemove={(index) =>
						runtime.applyTransform(removeSection(runtime.source, index), editorRef)}
				/>
			{/if}
		</div>
	</div>
{/snippet}

{#if workspace.data}
	<PageTitle title={projectDisplayTitle(workspace.data)} />
{/if}

{#if workspace.isPending}
	<div
		class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground md:h-[calc(100svh-1rem)]"
	>
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else if !workspace.data}
	<div
		class="flex h-svh flex-1 items-center justify-center text-muted-foreground md:h-[calc(100svh-1rem)]"
	>
		<p>Proyek tidak ditemukan.</p>
	</div>
{:else}
	<div
		bind:this={host}
		class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background md:h-[calc(100svh-1rem)]"
	>
		<ProjectChatRuntimeProvider
			{workspaceId}
			onTurnSent={handleTurnSent}
			onAgentSettled={handleAgentSettled}
		>
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
					<div
						class={mobileMode === 'chat' ? 'contents' : 'hidden'}
						aria-hidden={mobileMode !== 'chat'}
					>
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
		</ProjectChatRuntimeProvider>
	</div>
{/if}
