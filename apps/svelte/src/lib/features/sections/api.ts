import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';

/**
 * Hooks dokumen bab (sumber LaTeX). Save mengembalikan union `stale_write` dan tidak
 * men-toast error di sini — konsumen editor menampilkan status simpannya sendiri.
 */

const alwaysTrue = () => true;

export type SectionDocumentPayload = {
	artifactId: string;
	source: string;
	contentVersion: number;
	updatedAt: number;
} | null;

export type SaveSectionDocumentResult =
	| { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string }
	| { status: 'stale_write'; currentVersion: number };

export type WorkspaceBibliography = {
	styleId: string;
	entries: Array<{ id: string; text: string }>;
};

/** Sumber LaTeX bab (null = belum pernah ditulis). */
export function useSectionDocument(sectionId: () => string) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionDocument(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).document.get()) as SectionDocumentPayload
	}));
}

/**
 * Simpan sumber LaTeX bab. `baseVersion` mismatch → `stale_write` (union, bukan throw).
 * PENTING (aturan spec): respons save TIDAK boleh memicu refetch/replace buffer editor —
 * hanya perbarui baseVersion pemanggil; buffer client = source of truth selama mengetik.
 */
export function useSaveSectionDocument(sectionId: () => string, workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { source: string; baseVersion?: number }) =>
			unwrap(
				await api.sections({ id: sectionId() }).document.put({
					source: input.source,
					...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {})
				})
			) as SaveSectionDocumentResult,
		onSuccess: (result: SaveSectionDocumentResult) => {
			if (result.status !== 'saved') return;
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(workspaceId()) });
			qc.invalidateQueries({ queryKey: queryKeys.citations.bibliography(workspaceId()) });
		}
	}));
}

/** Daftar pustaka proyek (agregat sitasi terpakai di semua bab), dirender dengan gaya proyek. */
export function useWorkspaceBibliography(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.citations.bibliography(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).bibliography.get()
			) as WorkspaceBibliography
	}));
}
