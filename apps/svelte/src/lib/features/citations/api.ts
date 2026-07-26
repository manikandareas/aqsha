import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	keepPreviousData,
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
	exportFileExtension,
	exportFileName,
	resolveExportContent
} from './export-model';
import type {
	BibliographySort,
	BulkSearchSaveResult,
	CitationCandidate,
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
	SearchSourceInput
} from './types';

/**
 * Citation query/mutation hooks. List/detail/tags/create/import/export menerima
 * `workspaceId` getter (`null` = perpustakaan akun; string = koleksi proyek).
 * Reactive scalar inputs are getters. Query keys, invalidation, and toast copy
 * match the product contract.
 */

const LIST_PAGE_SIZE = 50;

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

function listQuery(f: CitationListFilters, pageParam: string | null) {
	return {
		limit: LIST_PAGE_SIZE,
		...(pageParam ? { cursor: pageParam } : {}),
		...(f.q ? { q: f.q } : {}),
		...(f.status ? { status: f.status } : {}),
		...(f.source ? { source: f.source } : {}),
		...(f.tag ? { tag: f.tag } : {})
	};
}

/** List referensi (infinite/keyset) — akun atau proyek via `workspaceId`. */
export function useCitationsList(
	filters: () => CitationListFilters,
	enabled: () => boolean,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.citations.list(workspaceId(), filters()),
		enabled: enabled(),
		placeholderData: keepPreviousData,
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) => {
			const f = filters();
			const ws = workspaceId();
			const query = listQuery(f, pageParam);
			if (ws) {
				return unwrap(
					await api.workspaces({ id: ws }).citations.get({ query })
				) as CitationListResponse;
			}
			return unwrap(await api.citations.get({ query })) as CitationListResponse;
		},
		getNextPageParam: (last: CitationListResponse) => last.nextCursor
	}));
}

/**
 * Unggah PDF ke perpustakaan akun: presign → PUT langsung ke object storage →
 * finalize. Finalize-lah yang membuat citation dan memicu post-processing, jadi
 * daftar cukup diinvalidasi sekali di akhir.
 */
export function useUploadLibraryPdf() {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (file: File) => {
			// Body presign kosong: unggahan perpustakaan tidak menuju proyek mana pun.
			const presigned = unwrap(await api.artifacts['upload-url'].post({})) as {
				uploadUrl: string;
				key: string;
			};
			const put = await fetch(presigned.uploadUrl, {
				method: 'PUT',
				body: file,
				headers: { 'content-type': file.type || 'application/pdf' }
			});
			if (!put.ok) throw new Error('Unggahan gagal');
			return unwrap(
				await api.artifacts.upload.post({
					key: presigned.key,
					fileName: file.name,
					mimeType: file.type || 'application/pdf',
					size: file.size
				})
			);
		},
		onSuccess: () => {
			invalidate();
			toast.success('PDF diunggah — metadata sedang diproses');
		},
		onError: (error: unknown) => toast.error(readableApiErrorMessage(error, 'Unggahan gagal'))
	}));
}

export function useCitationTags(
	enabled: () => boolean,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.tags(workspaceId()),
		enabled: enabled(),
		queryFn: async () => {
			const ws = workspaceId();
			if (ws) {
				return unwrap(await api.workspaces({ id: ws }).citations.tags.get()) as string[];
			}
			return unwrap(await api.citations.tags.get()) as string[];
		}
	}));
}

export function useCitationDetail(
	citationId: () => string | null,
	enabled: () => boolean,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.detail(workspaceId(), citationId() ?? ''),
		enabled: enabled() && Boolean(citationId()),
		queryFn: async () => {
			const id = citationId() ?? '';
			const ws = workspaceId();
			if (ws) {
				return unwrap(
					await api.workspaces({ id: ws }).citations({ citationId: id }).get()
				) as CitationDetail;
			}
			return unwrap(await api.citations({ citationId: id }).get()) as CitationDetail;
		}
	}));
}

/** Kandidat perpustakaan untuk picker "Tambah dari Perpustakaan". */
export function useCitationCandidates(
	workspaceId: () => string,
	filters: () => CitationListFilters,
	enabled: () => boolean
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.citations.candidates(workspaceId(), filters()),
		enabled: enabled() && Boolean(workspaceId()),
		placeholderData: keepPreviousData,
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) => {
			const f = filters();
			return unwrap(
				await api.workspaces({ id: workspaceId() }).citations.candidates.get({
					query: listQuery(f, pageParam)
				})
			) as { items: CitationCandidate[]; nextCursor: string | null; total: number };
		},
		getNextPageParam: (last: { items: CitationCandidate[]; nextCursor: string | null }) =>
			last.nextCursor
	}));
}

/** Create manual (fields) ATAU by-DOI (doi) — akun atau scoped proyek. */
export function useCreateCitation(workspaceId: () => string | null = () => null) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			doi?: string;
			fields?: ManualCitationFields;
			tags?: string[];
			allowDuplicate?: boolean;
			onDuplicate?: 'return-existing';
		}) => {
			const ws = workspaceId();
			if (ws) {
				return unwrap(await api.workspaces({ id: ws }).citations.post(input)) as CitationDetail & {
					created: boolean;
				};
			}
			return unwrap(await api.citations.post(input)) as CitationDetail & { created: boolean };
		},
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
export function useDuplicateGroups(enabled: () => boolean) {
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

export function useImportCommit(workspaceId: () => string | null = () => null) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			batchId: string;
			selectedIndexes: number[];
			duplicatePolicy: ImportDuplicatePolicy;
		}) => {
			const ws = workspaceId();
			return unwrap(
				await api.citations.imports({ batchId: input.batchId }).commit.post({
					selectedIndexes: input.selectedIndexes,
					duplicatePolicy: input.duplicatePolicy,
					...(ws ? { workspaceId: ws } : {})
				})
			) as ImportCommitResult;
		},
		onSuccess: () => invalidate()
	}));
}

type IntegrationProviderKey = 'mendeley' | 'zotero';

/** Folder/collection provider untuk picker penarikan. Account-level. */
export function useProviderFolders(provider: () => IntegrationProviderKey, enabled: () => boolean) {
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
export function useProviderSyncCommit(
	provider: () => IntegrationProviderKey,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	const invalidate = useInvalidateCitations();
	return createMutation(() => ({
		mutationFn: async (input: {
			batchId: string;
			selectedIndexes: number[];
			duplicatePolicy: ImportDuplicatePolicy;
		}) => {
			const ws = workspaceId();
			return unwrap(
				await api
					.integrations({ provider: provider() })
					.sync({ batchId: input.batchId })
					.commit.post({
						selectedIndexes: input.selectedIndexes,
						duplicatePolicy: input.duplicatePolicy,
						...(ws ? { workspaceId: ws } : {})
					})
			) as ImportCommitResult;
		},
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
	enabled: () => boolean
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
	enabled: () => boolean
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

export function useCitationSettings(workspaceId: () => string, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.settings(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
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

/** Unduh export (bibtex/ris/csl-json) — semua di scope atau id terpilih. */
export function useExportCitations(workspaceId: () => string | null = () => null) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { format: CitationExportFormat; ids?: string[] }) => {
			// Route mengembalikan Response text (content-disposition). Eden mem-parse body
			// sesuai content-type: bibtex/ris → string mentah, csl-json → array/objek. Semua
			// bentuk itu dinormalkan ke teks oleh resolveExportContent.
			const ws = workspaceId();
			const query = {
				format: input.format,
				...(input.ids?.length ? { ids: input.ids.join(',') } : {})
			};
			const data = unwrap(
				ws
					? await api.workspaces({ id: ws }).citations.export.get({ query })
					: await api.citations.export.get({ query })
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

function invalidateProjectMembership(qc: ReturnType<typeof useQueryClient>, workspaceId: string) {
	qc.invalidateQueries({ queryKey: queryKeys.citations.all });
	qc.invalidateQueries({ queryKey: queryKeys.citations.lists(workspaceId) });
	qc.invalidateQueries({ queryKey: queryKeys.citations.candidateLists(workspaceId) });
	qc.invalidateQueries({ queryKey: queryKeys.citations.links(workspaceId) });
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
		) => invalidateProjectMembership(qc, input.workspaceId),
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
		onSuccess: (_d: unknown, input: { workspaceId: string; citationId: string }) => {
			invalidateProjectMembership(qc, input.workspaceId);
			toast.success('Referensi dilepas dari proyek');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal melepas sumber dari proyek.'))
	}));
}

export function useBulkUnlinkCitations() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { workspaceId: string; ids: string[] }) =>
			unwrap(
				await api.workspaces({ id: input.workspaceId }).citations['bulk-unlink'].post({
					ids: input.ids
				})
			) as { affected: number },
		onSuccess: (result: { affected: number }, input: { workspaceId: string; ids: string[] }) => {
			invalidateProjectMembership(qc, input.workspaceId);
			toast.success(`${result.affected} referensi dilepas dari proyek`);
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal melepas referensi dari proyek.'))
	}));
}

// ── Simpan citation-first dari pencarian/feed ────────────────────────────────

/**
 * Menandai kegagalan pada tahap link-ke-proyek setelah citation berhasil dibuat, supaya
 * `onError` bisa membedakannya dari kegagalan create dan menampilkan satu toast yang akurat
 * (bukan toast warning dari sini ditambah toast success caller karena mutation "berhasil").
 */
class SourceLinkError extends Error {
	constructor(cause: unknown) {
		super('Gagal menautkan sumber ke proyek.', { cause });
	}
}

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
				try {
					unwrap(
						await api
							.workspaces({ id: input.workspaceId })
							.citations({ citationId: citation.id })
							.link.post({ sectionId: input.sectionId ?? null })
					);
				} catch (e) {
					// Citation is already saved to the library at this point. The mutation still
					// rejects (so callers' onSuccess — and their "saved & linked" toast — doesn't
					// fire), so invalidate here rather than relying on the onSuccess below.
					qc.invalidateQueries({ queryKey: queryKeys.citations.all });
					qc.invalidateQueries({ queryKey: queryKeys.citations.links(input.workspaceId) });
					throw new SourceLinkError(e);
				}
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
		onError: (e) =>
			e instanceof SourceLinkError
				? toast.warning('Sumber tersimpan ke perpustakaan, tapi gagal ditautkan ke proyek.')
				: toast.error(readableApiErrorMessage(e, 'Gagal menyimpan sumber.'))
	}));
}

// ── Batch save/export dari hasil pencarian literatur (Explore) ─────────────

/**
 * Simpan banyak paper terpilih sekaligus ke perpustakaan akun. Sukses per-source berdiri
 * sendiri — sibling gagal tidak membatalkan yang lain — jadi cache hanya di-invalidate bila
 * minimal satu source benar-benar tersimpan.
 */
export function useBulkSaveSearchSources() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (sources: SearchSourceInput[]) =>
			unwrap(await api.citations['bulk-save-search'].post({ sources })) as BulkSearchSaveResult,
		onSuccess: (result: BulkSearchSaveResult) => {
			if (result.saved > 0) qc.invalidateQueries({ queryKey: queryKeys.citations.all });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menyimpan sumber terpilih.'))
	}));
}

/** Unduh export paper terpilih dari hasil pencarian — tanpa menyimpannya ke perpustakaan. */
export function useExportSearchSources() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { format: CitationExportFormat; sources: SearchSourceInput[] }) => {
			const data = unwrap(
				await api.citations['export-search'].post({
					format: input.format,
					sources: input.sources
				})
			) as unknown;
			const content = await resolveExportContent(data);
			const blob = new Blob([content], { type: exportBlobType(input.format) });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `selected-papers.${exportFileExtension(input.format)}`;
			anchor.click();
			URL.revokeObjectURL(url);
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengekspor sumber terpilih.'))
	}));
}
