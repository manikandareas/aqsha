import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';

/**
 * Hooks dokumen Typst tunggal proyek. Tipe di-mirror manual dari service backend (apps/svelte tidak
 * mengimpor @aqsha/db / @aqsha/services). Save mengembalikan union `stale_write` dan TIDAK men-toast
 * error di sini — editor menampilkan status simpannya sendiri; buffer editor = source-of-truth
 * (respons save tak me-refetch dokumen).
 */

export type WorkspaceDocumentPayload = {
	artifactId: string;
	source: string;
	contentVersion: number;
	updatedAt: number;
} | null;

export type SaveWorkspaceDocumentResult =
	| { status: 'saved'; artifactId: string; contentVersion: number }
	| { status: 'stale_write'; currentVersion: number };

/** Sumber Typst proyek (null = belum pernah ditulis; lazy-create saat save pertama). */
export function useWorkspaceDocument(workspaceId: () => string, enabled: () => boolean = () => true) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.document(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).document.get()
			) as WorkspaceDocumentPayload
	}));
}

/**
 * Simpan sumber Typst proyek. `baseVersion` mismatch → `stale_write` (union, bukan throw). Respons
 * save TIDAK memicu refetch/replace buffer editor — hanya perbarui baseVersion pemanggil. Sitasi
 * yang dipakai dokumen dihitung ulang di server → invalidasi bibliografi setelah simpan sukses.
 */
export function useSaveWorkspaceDocument(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { source: string; baseVersion?: number }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).document.put({
					source: input.source,
					...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {})
				})
			) as SaveWorkspaceDocumentResult,
		onSuccess: (result: SaveWorkspaceDocumentResult) => {
			if (result.status !== 'saved') return;
			void qc.invalidateQueries({ queryKey: queryKeys.citations.bibliography(workspaceId()) });
		}
	}));
}

export type ExportResult = { url: string };

/** Ekspor dokumen penuh ke PDF (compile CLI server) → signed URL unduhan. */
export function useExportPdf(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).export.pdf.post()) as ExportResult
	}));
}

/** Ekspor dokumen penuh ke DOCX (pandoc `-f typst --citeproc`) → signed URL unduhan. */
export function useExportDocx(workspaceId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).export.docx.post()) as ExportResult
	}));
}
