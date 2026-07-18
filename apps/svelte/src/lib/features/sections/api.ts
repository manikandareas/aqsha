import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';

/**
 * Hooks dokumen bab. Save TIDAK memakai toast onError — indikator autosave di header editor
 * membaca status mutation langsung; toast per retry debounced akan jadi spam.
 */

const alwaysTrue = () => true;

export type SaveSectionDocumentResult =
	| { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string }
	| { status: 'stale_write'; currentVersion: number };

export type WorkspaceBibliography = {
	styleId: string;
	entries: Array<{ id: string; text: string }>;
};

/** Simpan DOCX bab hasil export SuperDoc. `baseVersion` mismatch → `stale_write` (union, bukan throw). */
export function useSaveSectionDocument(sectionId: () => string, workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { file: File; baseVersion?: number; clustersJson?: string }) =>
			unwrap(
				await api.sections({ id: sectionId() }).document.put({
					file: input.file,
					...(input.baseVersion !== undefined ? { baseVersion: input.baseVersion } : {}),
					...(input.clustersJson ? { clustersJson: input.clustersJson } : {})
				})
			) as SaveSectionDocumentResult,
		onSuccess: (result: SaveSectionDocumentResult) => {
			if (result.status !== 'saved') return;
			qc.invalidateQueries({ queryKey: queryKeys.workspaces.sections(workspaceId()) });
			qc.invalidateQueries({ queryKey: queryKeys.artifacts.detail(result.artifactId) });
			qc.invalidateQueries({ queryKey: queryKeys.artifacts.render(result.artifactId) });
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
