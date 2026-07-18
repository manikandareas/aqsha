<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import * as AlertDialog from '@aqsha/ui-svelte/components/alert-dialog';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import { Icon, ArrowLeftIcon, BookOpenIcon, DownloadIcon } from '$lib/icons';
	import ProjectSidePanel from '$lib/features/workspaces/components/ProjectSidePanel.svelte';
	import { useSections, useUpdateSection, useWorkspace } from '$lib/features/workspaces/api';
	import { SECTION_STATUS_LABELS } from '$lib/features/workspaces/labels';
	import {
		SECTION_STATUSES,
		projectDisplayTitle,
		type SectionStatus
	} from '$lib/features/workspaces/types';
	import { useArtifact, useArtifactRender } from '$lib/features/artifacts/api';
	import { useCitationSettings, useRenderDocumentCitations } from '$lib/features/citations/api';
	import type { CitationStyleId, DocumentCitationCluster } from '$lib/features/citations/types';
	import { useSaveSectionDocument } from '../api';
	import { SectionAutosave } from '../autosave.svelte';
	import BibliographyView from '../components/BibliographyView.svelte';
	import SectionCitationPicker from '../components/SectionCitationPicker.svelte';
	import SectionDocumentEditor from '../components/SectionDocumentEditor.svelte';
	import { generateStructuredContentId, type SectionEditorHandle } from '../superdoc-client';

	/**
	 * Halaman bab: editor DOCX di kiri, panel proyek (sumber/chat) di kanan.
	 * Bab bibliography = view read-only tanpa editor.
	 */
	let { projectId, sectionId }: { projectId: string; sectionId: string } = $props();

	const workspace = useWorkspace(() => projectId);
	const sections = useSections(() => projectId);
	const updateSection = useUpdateSection();

	const section = $derived(sections.data?.find((s) => s.id === sectionId) ?? null);
	const isBibliography = $derived(section?.role === 'bibliography');

	// documentArtifactId lokal: save pertama mengisinya TANPA remount editor
	// (sections invalidation datang belakangan; sesi mengetik tak boleh terputus).
	let localArtifactId = $state<string | null>(null);
	const documentArtifactId = $derived(localArtifactId ?? section?.documentArtifactId ?? null);

	const artifact = useArtifact(
		() => documentArtifactId ?? '',
		() => documentArtifactId !== null
	);
	const render = useArtifactRender(
		() => documentArtifactId ?? '',
		() => documentArtifactId !== null
	);
	const renderUrl = $derived(
		render.data && 'url' in render.data ? (render.data.url as string) : null
	);
	// Editor dimount SEKALI per dokumen: tunggu render-payload DAN detail artifact
	// (detail membawa contentVersion — baseVersion autosave harus benar sebelum
	// ketikan pertama, kalau tidak save pertama salah terdeteksi stale_write).
	const editorReady = $derived(
		documentArtifactId === null || (renderUrl !== null && artifact.data !== undefined)
	);

	let editorHandle = $state<SectionEditorHandle | null>(null);
	let panelTab = $state<'chat' | 'sources'>('sources');

	let pickerOpen = $state(false);
	// Snapshot pill sitasi dari dokumen — di-refresh tiap insert dan tiap editor update
	// tersimpan; kunci render citeproc reaktif (ganti gaya proyek → refetch → sinkron pill).
	let clusters = $state<DocumentCitationCluster[]>([]);

	function refreshClusters() {
		clusters = (editorHandle?.listCitations() ?? []).map((c) => ({
			nodeId: c.nodeId,
			citationIds: c.payload.citationIds,
			...(c.payload.locator ? { locator: c.payload.locator } : {}),
			...(c.payload.label ? { label: c.payload.label } : {}),
			...(c.payload.prefix ? { prefix: c.payload.prefix } : {}),
			...(c.payload.suffix ? { suffix: c.payload.suffix } : {})
		}));
	}

	const citationSettings = useCitationSettings(() => projectId);
	const styleId = $derived(
		(citationSettings.data?.defaultStyleId ?? null) as CitationStyleId | null
	);
	// Query key is a stable `{ styleId, clusters }` signature, so a `refreshClusters()` triggered
	// by an unrelated keystroke (same citation set, same nodeIds) doesn't refetch — only an actual
	// style change or citation-set change does.
	const documentRender = useRenderDocumentCitations(
		() => projectId,
		() => clusters,
		() => styleId,
		() => clusters.length > 0
	);

	// Sinkronkan teks pill di dokumen dari hasil render terbaru (ganti gaya, edit referensi, dst).
	// Aman dari loop: `updateCitationText` memicu editor `onUpdate` → `refreshClusters()`, tapi
	// nodeId/citationIds/locator pill tak berubah oleh sinkron teks, jadi signature query di atas
	// tetap sama dan tidak memicu render ulang.
	$effect(() => {
		const result = documentRender.data;
		if (!result || !editorHandle) return;
		for (const rendered of result.clusters) {
			editorHandle.updateCitationText(rendered.nodeId, rendered.text);
		}
	});

	function insertCitation(citation: { id: string; title: string }) {
		if (!editorHandle) return;
		const nodeId = generateStructuredContentId();
		// Teks sementara sampai render citeproc datang — pill langsung terlihat saat disisipkan.
		editorHandle.insertCitation(nodeId, { citationIds: [citation.id] }, `(${citation.title})`);
		refreshClusters();
		autosave?.markDirty();
	}

	async function downloadDocx() {
		if (!editorHandle || !section) return;
		const blob = await editorHandle.exportDocx();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${section.title}.docx`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	const saveDocument = useSaveSectionDocument(
		() => sectionId,
		() => projectId
	);

	let autosave = $state<SectionAutosave | null>(null);
	let staleVersion = $state<number | null>(null);

	// Clusters dikirim bersama tiap save — sumber kebenaran usages daftar pustaka datang dari
	// SDT sitasi yang benar-benar ada di dokumen saat itu, bukan dari state terpisah yang bisa lupa disinkronkan.
	function clustersJsonFromEditor(): string | undefined {
		const list = editorHandle?.listCitations() ?? [];
		if (list.length === 0) return undefined;
		return JSON.stringify(
			list.map((c) => ({
				nodeId: c.nodeId,
				citationIds: c.payload.citationIds,
				locator: {
					locator: c.payload.locator,
					label: c.payload.label,
					prefix: c.payload.prefix,
					suffix: c.payload.suffix
				}
			}))
		);
	}

	// Effect A: satu scheduler per editor+bab, dikonstruksi SEKALI. Sengaja TIDAK bergantung
	// reaktif pada `artifact.data` — save sukses menginvalidasi `artifacts.detail`, dan kalau
	// effect ini ikut re-run tiap refetch, instance lama dibongkar (timer save susulan yang sudah
	// di-re-arm karena ketikan SAAT save masih in-flight ikut batal) lalu diganti instance idle
	// baru, diam-diam menghilangkan ketikan itu. baseVersion awal dibaca lewat `untrack` supaya
	// pembacaan `artifact.data` di sini tidak ikut jadi dependency; sinkronisasi baseVersion
	// selanjutnya ditangani reaktif oleh Effect B tanpa membongkar instance.
	$effect(() => {
		if (!editorHandle || !section || isBibliography) return;
		const instance = new SectionAutosave({
			save: async (file, baseVersion) =>
				saveDocument.mutateAsync({ file, baseVersion, clustersJson: clustersJsonFromEditor() }),
			buildFile: async () => {
				const blob = await editorHandle!.exportDocx();
				return new File([blob], `${section.title}.docx`, { type: blob.type });
			},
			onSaved: (r) => {
				localArtifactId = r.artifactId;
			},
			onStale: (v) => {
				staleVersion = v;
			}
		});
		const initialVersion = untrack(() =>
			documentArtifactId ? (artifact.data?.artifact.contentVersion ?? undefined) : undefined
		);
		instance.setBaseVersion(initialVersion);
		autosave = instance;
		// Bab existing membawa pill dari save sebelumnya — sinkronkan snapshot begitu editor siap,
		// jangan tunggu ketikan pertama.
		refreshClusters();
		return () => {
			instance.dispose();
			autosave = null;
		};
	});

	// Effect B: sinkronkan baseVersion tiap kali detail artifact berubah (mis. refetch sesudah save
	// sukses, atau save pertama yang baru mengisi documentArtifactId) — TANPA membongkar scheduler.
	// Instance sudah membarui `#baseVersion`-nya sendiri sesudah tiap save, jadi re-affirm nilai
	// yang sama di sini aman (idempoten).
	$effect(() => {
		if (!autosave) return;
		autosave.setBaseVersion(
			documentArtifactId ? (artifact.data?.artifact.contentVersion ?? undefined) : undefined
		);
	});

	beforeNavigate(() => {
		if (!autosave?.hasUnsaved) return;
		// Simpan sinkron tak mungkin di sini — flush best-effort lalu biarkan navigasi tetap jalan.
		void autosave.flush();
	});

	$effect(() => {
		if (!autosave) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			if (autosave?.hasUnsaved) e.preventDefault();
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
</script>

<PageTitle title={section?.title ?? 'Bab'} />

<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
	<DetailSplitLayout sideOpen={true} onSideOpenChange={() => {}}>
		{#snippet main()}
			<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
				{#if sections.isPending}
					<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat bab…</span>
					</div>
				{:else if !section}
					<p class="text-muted-foreground">Bab tidak ditemukan.</p>
				{:else}
					<header class="flex flex-wrap items-center gap-3">
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
						{#if autosave && !isBibliography}
							<span class="text-label text-muted-foreground" aria-live="polite">
								{#if autosave.state === 'saving'}menyimpan…{:else if autosave.state === 'dirty'}belum
									tersimpan{:else if autosave.state === 'error'}gagal menyimpan
									<Button type="button" variant="ghost" size="sm" onclick={() => autosave?.retry()}>
										coba lagi
									</Button>
								{:else if autosave.state === 'stale'}dokumen berubah di tempat lain{:else}tersimpan{/if}
							</span>
						{/if}
						<!-- seam: insert-citation action -->
						{#if isBibliography}
							<Badge variant="outline">otomatis</Badge>
						{:else}
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="gap-1.5"
								disabled={!editorHandle}
								onclick={() => (pickerOpen = true)}
							>
								<Icon icon={BookOpenIcon} class="size-3.5" /> Sisipkan sitasi
							</Button>
							<Select.Root
								type="single"
								value={section.status}
								onValueChange={(v) =>
									updateSection.mutate({
										id: section.id,
										workspaceId: projectId,
										status: v as SectionStatus
									})}
							>
								<Select.Trigger class="w-32" aria-label="Status bab">
									{SECTION_STATUS_LABELS[section.status]}
								</Select.Trigger>
								<Select.Content>
									{#each SECTION_STATUSES as s (s)}
										<Select.Item value={s} label={SECTION_STATUS_LABELS[s]} />
									{/each}
								</Select.Content>
							</Select.Root>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="gap-1.5"
								disabled={!editorHandle}
								onclick={downloadDocx}
							>
								<Icon icon={DownloadIcon} class="size-3.5" /> Unduh DOCX
							</Button>
						{/if}
					</header>

					{#if isBibliography}
						<BibliographyView workspaceId={projectId} />
					{:else if artifact.isError || render.isError}
						<div
							class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
						>
							<span class="text-sm">Dokumen gagal dimuat.</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() => {
									artifact.refetch();
									render.refetch();
								}}
							>
								Coba lagi
							</Button>
						</div>
					{:else if !editorReady}
						<div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
							<Spinner class="size-4" />
							<span class="text-sm">Memuat dokumen…</span>
						</div>
					{:else}
						<div class="flex min-h-0 flex-1 flex-col rounded-lg border-2 border-border bg-card">
							{#key documentArtifactId}
								<SectionDocumentEditor
									documentUrl={renderUrl}
									fileName={`${section.title}.docx`}
									onHandle={(h) => (editorHandle = h)}
									onUpdate={() => {
										autosave?.markDirty();
										refreshClusters();
									}}
								/>
							{/key}
						</div>
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
				/>
			{/if}
		{/snippet}
	</DetailSplitLayout>
</div>

{#if staleVersion !== null}
	<AlertDialog.Root open={true}>
		<AlertDialog.Content onEscapeKeydown={(e) => e.preventDefault()}>
			<AlertDialog.Header>
				<AlertDialog.Title>Dokumen berubah di tempat lain</AlertDialog.Title>
				<AlertDialog.Description>
					Versi tersimpan lebih baru dari yang sedang kamu edit — kemungkinan dari tab lain. Muat
					ulang untuk melanjutkan; perubahan yang belum tersimpan di tab ini hilang.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Action onclick={() => window.location.reload()}>
					Muat ulang dokumen
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}

{#if section && !isBibliography}
	<SectionCitationPicker
		open={pickerOpen}
		onOpenChange={(o) => (pickerOpen = o)}
		workspaceId={projectId}
		onPick={insertCitation}
	/>
{/if}
