<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { queryKeys } from '$lib/query';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import { SvelteSet } from 'svelte/reactivity';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon, ChevronDownIcon, SparklesIcon, Code2Icon, EyeIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors/api-error';
	import ProjectSidePanel from '$lib/features/workspaces/components/ProjectSidePanel.svelte';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import { useSections, useWorkspace } from '$lib/features/workspaces/api';
	import { projectDisplayTitle } from '$lib/features/workspaces/types';
	import {
		useSectionDocument,
		useSaveSectionDocument,
		useSectionBuild,
		useCompileSection,
		useSectionAnnotations,
		useCreateAnnotation,
		useUpdateAnnotation,
		useDeleteAnnotation,
		useMarkAnnotationsSent,
		usePendingProposal,
		useAcceptProposal,
		useRejectProposal,
		useSynctexInverse,
		useSynctexForward,
		type AnnotationRect,
		type LatexCompileError
	} from '../api';
	import { buildAnnotationClientContext } from '../lib/annotation-context';
	import BibliographyView from '../components/BibliographyView.svelte';
	import SectionPdfViewer from '../components/SectionPdfViewer.svelte';
	import AnnotationQueuePanel from '../components/AnnotationQueuePanel.svelte';
	import AnnotationComposerDialog from '../components/AnnotationComposerDialog.svelte';
	import SectionBuildErrorPanel from '../components/SectionBuildErrorPanel.svelte';
	import ProposalReviewCard from '../components/ProposalReviewCard.svelte';
	import LatexSourceEditor from '../components/LatexSourceEditor.svelte';
	import { AutosaveController } from '../lib/autosave-controller.svelte';
	import type { LatexEditorHandle } from '../lib/latex-editor';

	/**
	 * Halaman bab agen-first: PDF ter-compile + lapisan anotasi (seleksi teks / pin) yang
	 * di-antrikan ke Astra lewat panel chat. Build tersimpan langsung tampil; sumber yang
	 * lebih baru dari build (basi) memicu compile ulang sekali. Bab bibliography tetap
	 * merender daftar pustaka (tanpa viewer/anotasi).
	 */
	let { projectId, sectionId }: { projectId: string; sectionId: string } = $props();

	// Channel mention per-halaman (pohon yang sama dengan composer panel chat): dipakai
	// draft-prefill "Tulis dengan Astra" dan quick-action perbaiki build.
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const document = useSectionDocument(() => sectionId);
	const build = useSectionBuild(() => sectionId);
	const annotations = useSectionAnnotations(() => sectionId);
	const createAnnotation = useCreateAnnotation(() => sectionId);
	const updateAnnotation = useUpdateAnnotation(() => sectionId);
	const deleteAnnotation = useDeleteAnnotation(() => sectionId);
	const markSent = useMarkAnnotationsSent(() => sectionId);
	const compile = useCompileSection(() => sectionId);
	const proposal = usePendingProposal(() => sectionId);
	const acceptProposal = useAcceptProposal(() => sectionId);
	const rejectProposal = useRejectProposal(() => sectionId);
	const qc = useQueryClient();

	// Error compile hasil pilihan hunk parsial (accept mengembalikan compile_error, bukan throw).
	let proposalAcceptErrors = $state<LatexCompileError[] | null>(null);

	const saveDocument = useSaveSectionDocument(
		() => sectionId,
		() => projectId
	);

	let editMode = $state(false);
	let editorHandle = $state<LatexEditorHandle | null>(null);

	// Controller autosave dibuat sekali saat dokumen tersedia; versi awal = versi termuat.
	let autosave = $state<AutosaveController | null>(null);
	const docKey = $derived(`${sectionId}:${document.data?.contentVersion ?? 0}`);

	$effect(() => {
		const doc = document.data;
		if (!doc) return;
		if (!autosave) {
			autosave = new AutosaveController({
				initialVersion: doc.contentVersion,
				save: (input) => saveDocument.mutateAsync(input)
			});
		}
	});

	$effect(() => {
		const c = autosave;
		return () => c?.dispose();
	});

	function handleEditorChange(next: string): void {
		autosave?.edit(next);
	}

	async function toggleEditMode(): Promise<void> {
		if (editMode) {
			// Keluar dari edit: pastikan simpanan terakhir tuntas sebelum kembali ke PDF.
			await autosave?.flush();
			editMode = false;
			return;
		}
		editMode = true;
	}

	// "Compile ulang" saat edit: flush dulu supaya build memakai sumber terbaru.
	async function requestCompileFromEditor(): Promise<void> {
		await autosave?.flush();
		requestCompile();
	}

	// Muat ulang sumber setelah konflik stale: ambil ulang dokumen & reset buffer + controller.
	async function reloadSource(): Promise<void> {
		await document.refetch();
		const doc = document.data;
		if (doc) {
			autosave?.reset(doc.contentVersion);
			editorHandle?.setDoc(doc.source);
		}
	}

	const saveStatusLabel = $derived.by(() => {
		switch (autosave?.status) {
			case 'saving':
				return 'Menyimpan…';
			case 'saved':
				return 'Tersimpan';
			case 'dirty':
				return 'Perubahan belum disimpan';
			case 'stale':
				return 'Sumber berubah di tempat lain';
			case 'error':
				return 'Gagal menyimpan';
			default:
				return '';
		}
	});

	const synctexInverse = useSynctexInverse(() => sectionId);
	const synctexForward = useSynctexForward(() => sectionId);
	let locateMode = $state(false);
	let pdfFlash = $state<{ page: number; xPt: number; yPt: number } | null>(null);

	// Klik PDF (mode lompat) → inverse → buka editor di baris.
	function handleLocate(a: { page: number; xPt: number; yPt: number }): void {
		synctexInverse.mutate(a, {
			onSuccess: (hit) => {
				if (!hit) {
					toast.info('Tidak ada baris sumber untuk titik itu.');
					return;
				}
				editMode = true;
				// Tunggu editor mount bila baru dibuka, lalu lompat.
				queueMicrotask(() => editorHandle?.scrollToLine(hit.line));
			}
		});
	}

	// Tombol editor "Lihat di PDF" → forward(baris kursor) → PDF + kedip.
	function locateInPdf(): void {
		const line = editorHandle?.getCursorLine();
		if (line == null) return;
		synctexForward.mutate(
			{ line },
			{
				onSuccess: (pos) => {
					if (!pos) {
						toast.info('Belum ada posisi PDF untuk baris itu (compile ulang dulu).');
						return;
					}
					editMode = false;
					pdfFlash = pos;
					queueMicrotask(() => {
						window.document
							.getElementById(`pdf-page-${pos.page}`)
							?.scrollIntoView({ behavior: 'smooth', block: 'center' });
					});
					// Bersihkan kedip setelah animasi.
					setTimeout(() => (pdfFlash = null), 2000);
				}
			}
		);
	}

	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
	const isBibliography = $derived(section?.role === 'bibliography');
	const currentVersion = $derived(document.data?.contentVersion ?? 0);
	const openAnnotationCount = $derived(
		(annotations.data ?? []).filter((a) => a.status === 'open').length
	);

	let panelTab = $state<'chat' | 'sources'>('sources');
	let pinMode = $state(false);
	let activeAnnotationId = $state<string | null>(null);
	let queueOpen = $state(false);
	const selectedAnnotationIds = new SvelteSet<string>();
	let pendingAnchor = $state<
		| { kind: 'highlight'; page: number; rects: AnnotationRect[]; selectedText: string }
		| { kind: 'pin'; page: number; rects: AnnotationRect[] }
		| null
	>(null);

	// Build basi = sumber bab lebih baru dari yang ter-render build tersimpan.
	const stale = $derived.by(() => {
		const b = build.data;
		const d = document.data;
		if (!b || !d) return false;
		return b.sourceVersions[sectionId] !== d.contentVersion;
	});

	// Satu compile in-flight; trigger beruntun coalesce — yang terakhir menang.
	let compileQueued = false;
	function requestCompile(): void {
		if (compile.isPending) {
			compileQueued = true;
			return;
		}
		compile.mutate(undefined, {
			onSettled: () => {
				if (compileQueued) {
					compileQueued = false;
					requestCompile();
				}
			}
		});
	}

	// Buka halaman: build tersimpan langsung tampil; basi/belum ada (padahal sumber ada) →
	// auto-compile sekali.
	let autoCompiled = false;
	$effect(() => {
		if (autoCompiled || build.isPending || document.isPending) return;
		if (!document.data) return;
		if (!build.data || stale) {
			autoCompiled = true;
			requestCompile();
		}
	});

	function handleCreateHighlight(a: {
		page: number;
		rects: AnnotationRect[];
		selectedText: string;
	}): void {
		pendingAnchor = { kind: 'highlight', ...a };
	}

	function handleCreatePin(a: { page: number; x: number; y: number }): void {
		pendingAnchor = { kind: 'pin', page: a.page, rects: [{ x: a.x, y: a.y, w: 0, h: 0 }] };
	}

	function submitAnnotation(note: string): void {
		const anchor = pendingAnchor;
		if (!anchor) return;
		pendingAnchor = null;
		createAnnotation.mutate(
			{
				kind: anchor.kind,
				page: anchor.page,
				rects: anchor.rects,
				selectedText: anchor.kind === 'highlight' ? anchor.selectedText : undefined,
				note: note || undefined
			},
			{ onError: (err) => toast.error(readableApiErrorMessage(err, 'Gagal menyimpan anotasi.')) }
		);
		if (anchor.kind === 'pin') pinMode = false;
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
		if (target) {
			window.document
				.getElementById(`pdf-page-${target.page}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	function writeWithAstra(): void {
		if (!section) return;
		mentions.setComposerDraft(
			`Tuliskan draf awal bab "${section.title}". Susun kerangka dan poin utama berdasarkan sumber yang sudah ada di proyek ini.`
		);
		panelTab = 'chat';
	}

	// Konteks chat bab: SELALU sertakan sectionId bab yang terbuka supaya agen bisa
	// get_section_source/propose_section_edit tanpa perlu anotasi (mis. menulis bab kosong lewat
	// CTA "Tulis dengan Astra"); antrian anotasi terpilih ditambahkan bila ada.
	function annotationContextParts(): string[] {
		if (!section) return [];
		const parts = [
			`Bab yang sedang dibuka user: "${section.title}" (sectionId: ${sectionId}). Bila user minta menulis atau menyunting bab ini, panggil get_section_source lalu propose_section_edit dengan sectionId tersebut.`
		];
		const chosen = (annotations.data ?? []).filter(
			(a) => a.status === 'open' && selectedAnnotationIds.has(a.id)
		);
		if (chosen.length > 0) {
			parts.push(
				buildAnnotationClientContext({
					sectionId,
					sectionTitle: section.title,
					annotations: chosen
				})
			);
		}
		return parts;
	}

	// Turn berangkat → tandai anotasi terpilih "terkirim" (ikut turn ini apa pun hasil stream).
	function handleTurnSent(threadId: string): void {
		const ids = [...selectedAnnotationIds];
		if (ids.length === 0) return;
		selectedAnnotationIds.clear();
		markSent.mutate({ ids, threadId });
	}

	// Turn selesai → segarkan proposal (mungkin baru dibuat agen) + status anotasi.
	function handleAgentSettled(): void {
		// Proposal baru dari agen tak boleh mewarisi error accept usulan sebelumnya.
		proposalAcceptErrors = null;
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId) });
		void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionAnnotations(sectionId) });
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
						toast.success('Suntingan diterapkan. Menyusun ulang PDF…');
						requestCompile();
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

	// Prefill draft dengan ringkasan error compile → user tinggal kirim (tetap HITL).
	function askAstraFixBuild(): void {
		const list = (build.data?.errors ?? [])
			.slice(0, 10)
			.map((e) => `- ${e.line != null ? `baris ${e.line}: ` : ''}${e.message}`)
			.join('\n');
		mentions.setComposerDraft(`Compile bab ini gagal. Perbaiki sumbernya.\n\nError:\n${list}`);
		panelTab = 'chat';
	}
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={true} onSideOpenChange={() => {}}>
		{#snippet main()}
			<div class="flex min-h-0 flex-1 flex-col">
				{#if sections.isPending}
					<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat bab…</span>
					</div>
				{:else if !section}
					<p class="p-4 text-muted-foreground">Bab tidak ditemukan.</p>
				{:else}
					<header class="flex shrink-0 flex-wrap items-center gap-3 px-4 pt-4 pb-3">
						<Button
							href={resolve('/app/(product)/projects/[projectId]', { projectId })}
							variant="ghost"
							size="icon"
							aria-label="Kembali ke proyek"
						>
							<Icon icon={ArrowLeftIcon} class="size-4" />
						</Button>
						<div class="min-w-0 flex-1">
							<h1 class="truncate font-heading text-xl font-bold">{section.title}</h1>
							<p class="truncate text-label text-muted-foreground">
								{workspace.data ? projectDisplayTitle(workspace.data) : ''}
							</p>
						</div>
						{#if isBibliography}
							<Badge variant="outline">otomatis</Badge>
						{:else}
							{#if stale}
								<Badge variant="outline">perlu compile ulang</Badge>
							{/if}
							{#if document.data}
								{#if editMode && saveStatusLabel}
									<span class="text-label text-muted-foreground">{saveStatusLabel}</span>
								{/if}
								{#if editMode}
									<Button type="button" variant="ghost" size="sm" onclick={locateInPdf}>
										<Icon icon={EyeIcon} class="size-4" />
										Lihat di PDF
									</Button>
								{/if}
								<Button
									type="button"
									variant={editMode ? 'secondary' : 'ghost'}
									size="sm"
									aria-pressed={editMode}
									onclick={toggleEditMode}
								>
									<Icon icon={editMode ? EyeIcon : Code2Icon} class="size-4" />
									{editMode ? 'Lihat PDF' : 'Edit sumber'}
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									disabled={compile.isPending}
									onclick={editMode ? requestCompileFromEditor : requestCompile}
								>
									{#if compile.isPending}
										<Spinner class="size-4" />
									{/if}
									Compile ulang
								</Button>
								<Badge variant="outline">Sumber v{autosave?.version ?? currentVersion}</Badge>
							{/if}
						{/if}
					</header>

					{#if isBibliography}
						<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
							<BibliographyView workspaceId={projectId} />
						</div>
					{:else if editMode && document.data}
						{#if autosave?.status === 'stale'}
							<div
								class="mx-4 mt-1 flex items-center justify-between gap-2 rounded-md border-2 border-border bg-lemon/20 px-3 py-2 text-label"
								role="status"
							>
								<span
									>Sumber bab ini berubah di tempat lain. Muat ulang untuk menyunting versi
									terbaru.</span
								>
								<Button type="button" size="sm" variant="secondary" onclick={reloadSource}>
									Muat ulang sumber
								</Button>
							</div>
						{/if}
						<div class="min-h-0 flex-1 px-4 pt-1 pb-4">
							<div class="h-full overflow-hidden rounded-lg border-2 border-border">
								<LatexSourceEditor
									value={document.data.source}
									{docKey}
									editable={autosave?.status !== 'stale'}
									onChange={handleEditorChange}
									onReady={(h) => (editorHandle = h)}
								/>
							</div>
						</div>
					{:else}
						{#if proposal.data}
							<div class="shrink-0 px-4 pt-1 pb-2">
								<ProposalReviewCard
									proposal={proposal.data}
									accepting={acceptProposal.isPending}
									acceptErrors={proposalAcceptErrors}
									onAccept={handleAcceptProposal}
									onReject={handleRejectProposal}
								/>
							</div>
						{/if}
						{#if build.data?.pdfUrl}
							<div class="shrink-0 px-4">
								<Collapsible.Root open={queueOpen} onOpenChange={(next) => (queueOpen = next)}>
									<Collapsible.Trigger
										class="flex w-full items-center gap-2 rounded-md py-1.5 text-label text-muted-foreground transition-colors hover:text-foreground"
									>
										<Icon
											icon={ChevronDownIcon}
											class="size-3.5 transition-transform {queueOpen ? 'rotate-180' : ''}"
										/>
										<span class="font-medium">Anotasi ({openAnnotationCount})</span>
										{#if selectedAnnotationIds.size > 0}
											<span class="text-micro"
												>· {selectedAnnotationIds.size} terpilih akan dikirim bersama pesan berikutnya</span
											>
										{/if}
									</Collapsible.Trigger>
									<Collapsible.Content>
										<div class="pb-2">
											<AnnotationQueuePanel
												annotations={annotations.data ?? []}
												selectedIds={selectedAnnotationIds}
												{currentVersion}
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

						{#if build.data?.status === 'error'}
							<div class="shrink-0 px-4 pb-2">
								<SectionBuildErrorPanel
									errors={build.data.errors ?? []}
									logTail={build.data.logTail}
									onAskAstra={askAstraFixBuild}
								/>
							</div>
						{/if}

						{#if build.data?.pdfUrl}
							<SectionPdfViewer
								url={build.data.pdfUrl}
								annotations={annotations.data ?? []}
								bind:pinMode
								bind:locateMode
								{activeAnnotationId}
								{stale}
								flash={pdfFlash}
								onCreateHighlight={handleCreateHighlight}
								onCreatePin={handleCreatePin}
								onSelectAnnotation={(id) => (activeAnnotationId = id)}
								onLocate={handleLocate}
							/>
						{:else if document.data}
							<div
								class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 pb-4 text-center text-muted-foreground"
							>
								<Spinner class="size-4" />
								<span class="text-sm">Menyiapkan PDF…</span>
							</div>
						{:else if document.isPending}
							<div
								class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground"
							>
								<Spinner class="size-4" />
								<span class="text-sm">Memuat bab…</span>
							</div>
						{:else}
							<div class="flex min-h-0 flex-1 items-center justify-center p-4">
								<div
									class="flex max-w-sm flex-col items-center gap-3 rounded-lg border-2 border-border bg-card p-8 text-center"
								>
									<p class="text-sm font-medium text-foreground">Bab ini belum ditulis.</p>
									<p class="text-label text-muted-foreground">
										Minta Astra menyusun draf awal dari sumber yang sudah ada di proyek.
									</p>
									<Button type="button" onclick={writeWithAstra}>
										<Icon icon={SparklesIcon} class="size-4" />
										Tulis dengan Astra
									</Button>
								</div>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		{/snippet}
		{#snippet side()}
			{#if workspace.data && sections.data}
				<ProjectSidePanel
					workspaceId={projectId}
					workspaceName={projectDisplayTitle(workspace.data)}
					sections={sections.data}
					activeTab={panelTab}
					onTabChange={(t) => (panelTab = t)}
					onClose={() => {}}
					getExtraClientContext={annotationContextParts}
					onTurnSent={handleTurnSent}
					onAgentSettled={handleAgentSettled}
				/>
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>

<AnnotationComposerDialog
	open={pendingAnchor !== null}
	kind={pendingAnchor?.kind ?? 'highlight'}
	excerpt={pendingAnchor?.kind === 'highlight' ? pendingAnchor.selectedText : null}
	onSubmit={submitAnnotation}
	onCancel={() => (pendingAnchor = null)}
/>
