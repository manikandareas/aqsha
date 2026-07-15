import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient
} from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { getApiClient } from '$lib/api';
import { readableApiErrorMessage } from '$lib/errors';
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
	ProviderFolder
} from './types';

/**
 * Citation query/mutation hooks — Svelte port of `apps/web/features/citations/api.ts` (ART-2..5).
 * Reactive scalar inputs (`workspaceId`, `citationId`, `filters`, `params`, `enabled`) are getters
 * (§3.6). Query keys, invalidation and toast copy byte-equivalent with web (§11.2).
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

/** List referensi workspace (infinite/keyset) + `total` untuk count toolbar. */
export function useCitationsList(workspaceId: () => string, filters: () => CitationListFilters) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.citations.list(workspaceId(), filters()),
		enabled: Boolean(workspaceId()),
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) => {
			const f = filters();
			return unwrap(
				await api.workspaces({ id: workspaceId() }).citations.get({
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

export function useCitationTags(workspaceId: () => string) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.tags(workspaceId()),
		enabled: Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).citations.tags.get()) as string[]
	}));
}

export function useCitationDetail(workspaceId: () => string, citationId: () => string | null) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.detail(workspaceId(), citationId() ?? ''),
		enabled: Boolean(citationId()),
		queryFn: async () =>
			unwrap(
				await api
					.workspaces({ id: workspaceId() })
					.citations({ citationId: citationId() ?? '' })
					.get()
			) as CitationDetail
	}));
}

function useInvalidateCitations(workspaceId: () => string) {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: queryKeys.citations.workspace(workspaceId()) });
}

/** Create manual (fields) ATAU by-DOI (doi) — satu endpoint POST. */
export function useCreateCitation(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: {
			doi?: string;
			fields?: ManualCitationFields;
			tags?: string[];
			allowDuplicate?: boolean;
		}) =>
			unwrap(await api.workspaces({ id: workspaceId() }).citations.post(input)) as CitationDetail,
		onSuccess: () => invalidate()
	}));
}

export function useUpdateCitation(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: {
			citationId: string;
			fields?: ManualCitationFields;
			tags?: string[];
			artifactId?: string | null;
			markReviewed?: boolean;
		}) =>
			unwrap(
				await api
					.workspaces({ id: workspaceId() })
					.citations({ citationId: input.citationId })
					.patch({
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

export function useDeleteCitation(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (citationId: string) =>
			unwrap(await api.workspaces({ id: workspaceId() }).citations({ citationId }).delete()) as {
				ok: true;
			},
		onSuccess: () => {
			invalidate();
			toast.success('Referensi dihapus');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menghapus referensi'))
	}));
}

export function useMergeCitations(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: { sourceId: string; targetId: string }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations.duplicates.merge.post(input)
			) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Referensi digabungkan');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menggabungkan referensi'))
	}));
}

/** Grup kandidat duplikat workspace (dialog "Kelola duplikat"). */
export function useDuplicateGroups(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.duplicates(workspaceId()),
		enabled: enabled(),
		queryFn: async () =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations.duplicates.get()
			) as CitationDuplicateGroup[]
	}));
}

/** Merge banyak referensi (bulk bar / kelola duplikat) — target opsional. */
export function useMergeManyCitations(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; targetId?: string }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations.merge.post(input)
			) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Referensi digabungkan');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menggabungkan referensi'))
	}));
}

/** Tambah tag ke banyak referensi terpilih. */
export function useBulkTagCitations(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; tags: string[] }) =>
			unwrap(await api.workspaces({ id: workspaceId() }).citations['bulk-tag'].post(input)) as {
				affected: number;
			},
		onSuccess: (result: { affected: number }) => {
			invalidate();
			toast.success(`${result.affected} referensi diberi tag`);
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal memberi tag'))
	}));
}

/** Hapus (soft delete) banyak referensi terpilih. */
export function useBulkDeleteCitations(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (ids: string[]) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations['bulk-delete'].post({ ids })
			) as { affected: number },
		onSuccess: (result: { affected: number }) => {
			invalidate();
			toast.success(`${result.affected} referensi dihapus`);
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menghapus referensi'))
	}));
}

/** "Tambahkan ke Sitasi" dari artifact paper (Fase 2 bridge). */
export function useCreateCitationFromArtifact(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: { artifactId: string; tags?: string[] }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations['from-artifact'].post(input)
			) as CreateFromArtifactResult,
		onSuccess: () => invalidate(),
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menambahkan ke Sitasi'))
	}));
}

/** Perbarui metadata referensi dari DOI-nya (quality workflow Fase 2). */
export function useResolveCitation(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (citationId: string) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations({ citationId }).resolve.post()
			) as CitationDetail,
		onSuccess: () => {
			invalidate();
			toast.success('Metadata diperbarui dari DOI');
		},
		onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal memperbarui metadata'))
	}));
}

export function useImportPreview(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (file: File) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).citations.imports.preview.post({ file })
			) as ImportPreviewResult
	}));
}

export function useImportCommit(workspaceId: () => string) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
	return createMutation(() => ({
		mutationFn: async (input: {
			batchId: string;
			selectedIndexes: number[];
			duplicatePolicy: ImportDuplicatePolicy;
		}) =>
			unwrap(
				await api
					.workspaces({ id: workspaceId() })
					.citations.imports({ batchId: input.batchId })
					.commit.post({
						selectedIndexes: input.selectedIndexes,
						duplicatePolicy: input.duplicatePolicy
					})
			) as ImportCommitResult,
		onSuccess: () => invalidate()
	}));
}

type IntegrationProviderKey = 'mendeley' | 'zotero';

/** Folder/collection provider untuk picker penarikan (Fase 5). Account-level. */
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

/** Preview penarikan folder provider → reuse UI wizard import (Fase 5). */
export function useProviderSyncPreview(
	workspaceId: () => string,
	provider: () => IntegrationProviderKey
) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { folderId: string | null }) =>
			unwrap(
				await api.integrations({ provider: provider() }).sync.preview.post({
					workspaceId: workspaceId(),
					folderId: input.folderId
				})
			) as ImportPreviewResult
	}));
}

/** Commit hasil sync provider — reuse pipeline commit import (Fase 5). */
export function useProviderSyncCommit(
	workspaceId: () => string,
	provider: () => IntegrationProviderKey
) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations(workspaceId);
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
						workspaceId: workspaceId(),
						selectedIndexes: input.selectedIndexes,
						duplicatePolicy: input.duplicatePolicy
					})
			) as ImportCommitResult,
		onSuccess: () => invalidate()
	}));
}

/** Render preview terformat (per-entry + bibliography) — dipakai detail + "Salin sitasi". */
export function useCitationRender(
	workspaceId: () => string,
	params: () => { styleId: CitationStyleId | null; ids: string[] },
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.render(workspaceId(), params()),
		enabled: enabled() && params().ids.length > 0,
		queryFn: async () => {
			const p = params();
			return unwrap(
				await api.workspaces({ id: workspaceId() }).citations.render.post({
					...(p.styleId ? { styleId: p.styleId } : {}),
					citationIds: p.ids
				})
			) as CitationRenderResult;
		}
	}));
}

/**
 * Render sitasi in-text seluruh dokumen + bibliography used-in-document (Fase 3).
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
export function useCopyCitation(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (citationId: string) => {
			const result = unwrap(
				await api.workspaces({ id: workspaceId() }).citations.render.post({
					citationIds: [citationId]
				})
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
	const invalidate = useInvalidateCitations(workspaceId);
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

/** Unduh export (bibtex/ris/csl-json) sebagai file — semua atau id terpilih. */
export function useExportCitations(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { format: CitationExportFormat; ids?: string[] }) => {
			// Route mengembalikan Response text (content-disposition). Eden mem-parse body
			// sesuai content-type: bibtex/ris → string mentah, csl-json → array/objek. Semua
			// bentuk itu dinormalkan ke teks oleh resolveExportContent.
			const data = unwrap(
				await api.workspaces({ id: workspaceId() }).citations.export.get({
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
