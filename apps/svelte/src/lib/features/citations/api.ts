import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient
} from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { getApiClient } from '$lib/api';
import { readableApiErrorMessage } from '$lib/errors';
import { paperToCitationInput, type SourceSaveInput } from '$lib/features/discovery/source-save';
import { queryKeys, unwrap } from '$lib/query';
import {
	type CitationExportFormat,
	exportBlobType,
	exportFileName,
	resolveExportContent
} from './export-model';
import type {
	BibliographySort,
	CitationDetail,
	CitationDuplicateGroup,
	CitationListResponse,
	CitationRenderResult,
	CitationSettings,
	CitationStyleId,
	CreateFromArtifactResult,
	DocumentCitationCluster,
	DocumentRenderResult,
	ImportCommitResult,
	ImportDuplicatePolicy,
	ImportPreviewResult,
	ManualCitationFields,
	ProviderFolder,
	WorkspaceCitationItem
} from './types';

/**
 * Citation query/mutation hooks. Perpustakaan referensi (`useCitations*`) hidup di level akun —
 * hooks-nya tanpa parameter `workspaceId`. Koleksi per proyek (link perpustakaan↔proyek↔bab) dan
 * fitur yang inheren berkonteks proyek (import, provider sync, render, settings) tetap workspace-scoped.
 * Reactive scalar inputs (`citationId`, `filters`, `params`, `enabled`) are getters. Query keys,
 * invalidation, and toast copy match the product contract.
 */

const LIST_PAGE_SIZE = 50;

const alwaysTrue = () => true;

export type CitationListFilters = {
	q: string;
	status: 'verified' | 'needs_review' | 'incomplete' | null;
	source: 'import' | 'provider_sync' | 'artifact' | 'doi' | 'manual' | null;
	tag: string | null;
};

export const EMPTY_CITATION_FILTERS: CitationListFilters = {
	q: '',
	status: null,
	source: null,
	tag: null
};

function useInvalidateCitations() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: queryKeys.citations.all });
}

/** List referensi perpustakaan akun (infinite/keyset) + `total` untuk count toolbar. */
export function useCitationsList(filters: () => CitationListFilters) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.citations.list(filters()),
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) => {
			const f = filters();
			return unwrap(
				await api.citations.get({
					query: {
						limit: LIST_PAGE_SIZE,
						...(pageParam ? { cursor: pageParam } : {}),
						...(f.q ? { q: f.q } : {}),
						...(f.status ? { status: f.status } : {}),
						...(f.source ? { source: f.source } : {}),
						...(f.tag ? { tag: f.tag } : {})
					}
				})
			) as CitationListResponse;
		},
		getNextPageParam: (last: CitationListResponse) => last.nextCursor
	}));
}

export function useCitationTags() {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.tags(),
		queryFn: async () => unwrap(await api.citations.tags.get()) as string[]
	}));
}

export function useCitationDetail(citationId: () => string | null) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.detail(citationId() ?? ''),
		enabled: Boolean(citationId()),
		queryFn: async () =>
			unwrap(await api.citations({ citationId: citationId() ?? '' }).get()) as CitationDetail
	}));
}

/** Create manual (fields) ATAU by-DOI (doi) — satu endpoint POST. */
export function useCreateCitation() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			doi?: string;
			fields?: ManualCitationFields;
			tags?: string[];
			allowDuplicate?: boolean;
			onDuplicate?: 'return-existing';
		}) => unwrap(await api.citations.post(input)) as CitationDetail & { created: boolean },
		onSuccess: () => invalidate()
	}));
}

export function useUpdateCitation() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			citationId: string;
			fields?: ManualCitationFields;
			tags?: string[];
			artifactId?: string | null;
			markReviewed?: boolean;
		}) =>
			unwrap(
				await api.citations({ citationId: input.citationId }).patch({
					fields: input.fields,
					tags: input.tags,
					artifactId: input.artifactId,
					markReviewed: input.markReviewed
				})
			) as CitationDetail,
		onSuccess: () => invalidate(),
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyimpan referensi'))
	}));
}

export function useDeleteCitation() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (citationId: string) =>
			unwrap(await api.citations({ citationId }).delete()) as { ok: true },
		onSuccess: () => {
			invalidate();
			toast.success('Referensi dihapus');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menghapus referensi'))
	}));
}

export function useMergeCitations() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: { sourceId: string; targetId: string }) =>
			unwrap(await api.citations.duplicates.merge.post(input)) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Referensi digabungkan');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menggabungkan referensi'))
	}));
}

/** Grup kandidat duplikat perpustakaan (dialog "Kelola duplikat"). */
export function useDuplicateGroups(enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.duplicates(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.citations.duplicates.get()) as CitationDuplicateGroup[]
	}));
}

/** Merge banyak referensi (bulk bar / kelola duplikat) — target opsional. */
export function useMergeManyCitations() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; targetId?: string }) =>
			unwrap(await api.citations.merge.post(input)) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Referensi digabungkan');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menggabungkan referensi'))
	}));
}

/** Tambah tag ke banyak referensi terpilih. */
export function useBulkTagCitations() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; tags: string[] }) =>
			unwrap(await api.citations['bulk-tag'].post(input)) as { affected: number },
		onSuccess: (result: { affected: number }) => {
			invalidate();
			toast.success(`${result.affected} referensi diberi tag`);
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal memberi tag'))
	}));
}

/** Hapus (soft delete) banyak referensi terpilih. */
export function useBulkDeleteCitations() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (ids: string[]) =>
			unwrap(await api.citations['bulk-delete'].post({ ids })) as { affected: number },
		onSuccess: (result: { affected: number }) => {
			invalidate();
			toast.success(`${result.affected} referensi dihapus`);
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menghapus referensi'))
	}));
}

/** "Tambahkan ke Sitasi" dari artifact paper — tetap workspace-scoped (artifact hidup di proyek). */
export function useCreateCitationFromArtifact(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: { artifactId: string; tags?: string[] }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations['from-artifact'].post(input)
			) as CreateFromArtifactResult,
		onSuccess: () => invalidate(),
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menambahkan ke Sitasi'))
	}));
}

/** Perbarui metadata referensi dari DOI-nya (quality workflow). */
export function useResolveCitation() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (citationId: string) =>
			unwrap(await api.citations({ citationId }).resolve.post()) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Metadata diperbarui dari DOI');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal memperbarui metadata'))
	}));
}

export function useImportPreview() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (file: File) =>
			unwrap(await api.citations.imports.preview.post({ file })) as ImportPreviewResult
	}));
}

export function useImportCommit() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			batchId: string;
			selectedIndexes: number[];
			duplicatePolicy: ImportDuplicatePolicy;
		}) =>
			unwrap(
				await api.citations.imports({ batchId: input.batchId }).commit.post({
					selectedIndexes: input.selectedIndexes,
					duplicatePolicy: input.duplicatePolicy
				})
			) as ImportCommitResult,
		onSuccess: () => invalidate()
	}));
}

type IntegrationProviderKey = 'mendeley' | 'zotero';

/** Folder/collection provider untuk picker penarikan. Account-level. */
export function useProviderFolders(
	provider: () => IntegrationProviderKey,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.integrations.folders(provider()),
		enabled: enabled(),
		queryFn: async () =>
			unwrap(await api.integrations({ provider: provider() }).folders.get()) as ProviderFolder[]
	}));
}

/** Preview penarikan folder provider → reuse UI wizard import. */
export function useProviderSyncPreview(provider: () => IntegrationProviderKey) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { folderId: string | null }) =>
			unwrap(
				await api.integrations({ provider: provider() }).sync.preview.post({
					folderId: input.folderId
				})
			) as ImportPreviewResult
	}));
}

/** Commit hasil sync provider — reuse pipeline commit import. */
export function useProviderSyncCommit(provider: () => IntegrationProviderKey) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			batchId: string;
			selectedIndexes: number[];
			duplicatePolicy: ImportDuplicatePolicy;
		}) =>
			unwrap(
				await api
					.integrations({ provider: provider() })
					.sync({ batchId: input.batchId })
					.commit.post({
						selectedIndexes: input.selectedIndexes,
						duplicatePolicy: input.duplicatePolicy
					})
			) as ImportCommitResult,
		onSuccess: () => invalidate()
	}));
}

/**
 * Render preview terformat (per-entry + bibliography) — dipakai detail + "Salin sitasi".
 * `workspaceId` non-null → gaya sitasi proyek; `null` → perpustakaan akun (default apa-7).
 */
export function useCitationRender(
	workspaceId: () => string | null,
	params: () => { styleId: CitationStyleId | null; ids: string[] },
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.render(workspaceId(), params()),
		enabled: enabled() && params().ids.length > 0,
		queryFn: async () => {
			const p = params();
			const body = {
				...(p.styleId ? { styleId: p.styleId } : {}),
				citationIds: p.ids
			};
			const wsId = workspaceId();
			return unwrap(
				wsId
					? await api.workspaces({ id: wsId }).citations.render.post(body)
					: await api.citations.render.post(body)
			) as CitationRenderResult;
		}
	}));
}

/**
 * Render sitasi in-text seluruh dokumen + bibliography used-in-document.
 * Keyed pada signature stabil dari `{ styleId, clusters }` supaya hanya refetch saat
 * himpunan sitasi/locator berubah, bukan tiap keystroke. `placeholderData` menahan
 * hasil lama agar marker tak berkedip saat mengetik.
 */
export function useRenderDocumentCitations(
	workspaceId: () => string,
	clusters: () => DocumentCitationCluster[],
	styleId: () => CitationStyleId | null,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => {
		const signature = JSON.stringify({ styleId: styleId(), clusters: clusters() });
		return {
			queryKey: queryKeys.citations.renderDocument(workspaceId(), signature),
			enabled: enabled() && Boolean(workspaceId()),
			placeholderData: (prev: DocumentRenderResult | undefined) => prev,
			queryFn: async () =>
				unwrap(
					await api.workspaces({ id: workspaceId() }).citations['render-document'].post({
						...(styleId() ? { styleId: styleId() as CitationStyleId } : {}),
						clusters: clusters()
					})
				) as DocumentRenderResult
		};
	});
}

/** "Salin sitasi": render satu referensi pada style default lalu salin ke clipboard. */
export function useCopyCitation(workspaceId: () => string | null) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (citationId: string) => {
			const body = { citationIds: [citationId] };
			const wsId = workspaceId();
			const result = unwrap(
				wsId
					? await api.workspaces({ id: wsId }).citations.render.post(body)
					: await api.citations.render.post(body)
			) as CitationRenderResult;
			const text = result.entries[0]?.text;
			if (!text) throw new Error('render kosong');
			await navigator.clipboard.writeText(text);
		},
		onSuccess: () => toast.success('Sitasi disalin'),
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyalin sitasi'))
	}));
}

export function useCitationSettings(workspaceId: () => string) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.settings(workspaceId()),
		enabled: Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(
				await api.workspaces({ id: workspaceId() })['citation-settings'].get()
			) as CitationSettings
	}));
}

export function useUpdateCitationSettings(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			defaultStyleId?: CitationStyleId;
			bibliographySort?: BibliographySort;
		}) =>
			unwrap(
				await api.workspaces({ id: workspaceId() })['citation-settings'].patch(input)
			) as CitationSettings,
		onSuccess: () => {
			// Style default berubah → semua render preview ikut basi, bukan hanya settings.
			invalidate();
			toast.success('Pengaturan sitasi disimpan');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyimpan pengaturan'))
	}));
}

/** Unduh export (bibtex/ris/csl-json) sebagai file — semua atau id terpilih. Perpustakaan akun. */
export function useExportCitations() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { format: CitationExportFormat; ids?: string[] }) => {
			// Route mengembalikan Response text (content-disposition). Eden mem-parse body
			// sesuai content-type: bibtex/ris → string mentah, csl-json → array/objek. Semua
			// bentuk itu dinormalkan ke teks oleh resolveExportContent.
			const data = unwrap(
				await api.citations.export.get({
					query: {
						format: input.format,
						...(input.ids?.length ? { ids: input.ids.join(',') } : {})
					}
				})
			) as unknown;
			const content = await resolveExportContent(data);
			const blob = new Blob([content], { type: exportBlobType(input.format) });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = exportFileName(input.format);
			anchor.click();
			URL.revokeObjectURL(url);
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal mengekspor referensi'))
	}));
}

// ── Koleksi sumber per proyek (workspace_citation_links) ────────────────────

export function useWorkspaceCitations(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.links(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).citations.get()) as {
				items: WorkspaceCitationItem[];
			}
	}));
}

export function useLinkCitation() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			workspaceId: string;
			citationId: string;
			sectionId?: string | null;
		}) =>
			unwrap(
				await api
					.workspaces({ id: input.workspaceId })
					.citations({ citationId: input.citationId })
					.link.post({ sectionId: input.sectionId ?? null })
			),
		onSuccess: (
			_d: unknown,
			input: { workspaceId: string; citationId: string; sectionId?: string | null }
		) => qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menambahkan sumber ke proyek.'))
	}));
}

export function useUnlinkCitation() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; citationId: string }) =>
			unwrap(
				await api
					.workspaces({ id: input.workspaceId })
					.citations({ citationId: input.citationId })
					.link.delete()
			),
		onSuccess: (_d: unknown, input: { workspaceId: string; citationId: string }) =>
			qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal melepas sumber dari proyek.'))
	}));
}

export function useAssignCitationSection() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { linkId: string; workspaceId: string; sectionId: string | null }) =>
			unwrap(
				await api['citation-links']({ linkId: input.linkId }).patch({ sectionId: input.sectionId })
			),
		onSuccess: (
			_d: unknown,
			input: { linkId: string; workspaceId: string; sectionId: string | null }
		) => qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menandai bab untuk sumber.'))
	}));
}

// ── Simpan citation-first dari pencarian/feed ────────────────────────────────

/**
 * Simpan sumber hasil pencarian: buat citation di perpustakaan akun (duplikat →
 * pakai yang lama, tanpa entri dobel) lalu opsional auto-link ke proyek/bab.
 */
export function useSaveSource() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			source: SourceSaveInput;
			workspaceId?: string | null;
			sectionId?: string | null;
		}) => {
			const citation = unwrap(
				await api.citations.post({
					...paperToCitationInput(input.source),
					onDuplicate: 'return-existing'
				})
			) as CitationDetail & { created: boolean };
			if (input.workspaceId) {
				unwrap(
					await api
						.workspaces({ id: input.workspaceId })
						.citations({ citationId: citation.id })
						.link.post({ sectionId: input.sectionId ?? null })
				);
			}
			return citation;
		},
		onSuccess: (
			_d: unknown,
			input: { source: SourceSaveInput; workspaceId?: string | null; sectionId?: string | null }
		) => {
			qc.invalidateQueries({ queryKey: queryKeys.citations.all });
			if (input.workspaceId) {
				qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) });
			}
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menyimpan sumber.'))
	}));
}
