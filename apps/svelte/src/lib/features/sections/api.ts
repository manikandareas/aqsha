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

export type LatexCompileError = { line: number | null; message: string; severity: string };

export type LatexBuildView = {
	id: string;
	status: 'ok' | 'error';
	errors: LatexCompileError[] | null;
	logTail: string | null;
	sourceVersions: Record<string, number>;
	builtAt: number;
	pdfUrl: string | null;
} | null;

export type LatexCompileOutcome =
	{ status: 'ok'; buildId: string } | { status: 'error'; errors: LatexCompileError[] };

export type AnnotationRect = { x: number; y: number; w: number; h: number };

export type AnnotationView = {
	id: string;
	kind: 'highlight' | 'pin';
	page: number;
	rects: AnnotationRect[];
	selectedText: string | null;
	note: string | null;
	sourceFile: string | null;
	sourceLine: number | null;
	sourceVersion: number;
	status: 'open' | 'sent' | 'resolved' | 'dismissed';
	threadId: string | null;
	messageId: string | null;
	createdAt: number;
	updatedAt: number;
};

/** Build per-bab tersimpan (null = belum pernah compile). */
export function useSectionBuild(sectionId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionBuild(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).build.get()) as LatexBuildView
	}));
}

/** Compile per-bab. Union `status:'error'` = hasil produk (build error), bukan throw. */
export function useCompileSection(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).compile.post()) as LatexCompileOutcome,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionBuild(sectionId()) });
		}
	}));
}

export type SynctexInverseResult = { line: number } | null;
export type SynctexForwardResult = { page: number; xPt: number; yPt: number } | null;

/** Klik PDF → baris sumber (best-effort; null bila tak ada synctex / di luar body bab). */
export function useSynctexInverse(sectionId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { page: number; xPt: number; yPt: number }) =>
			unwrap(await api.sections({ id: sectionId() }).synctex.inverse.post(input)) as SynctexInverseResult
	}));
}

/** Baris sumber → posisi PDF (best-effort). */
export function useSynctexForward(sectionId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: { line: number }) =>
			unwrap(
				await api.sections({ id: sectionId() }).synctex.forward.post(input)
			) as SynctexForwardResult
	}));
}

export function useWorkspaceBuild(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.workspaceBuild(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).build.get()) as LatexBuildView
	}));
}

export function useCompileWorkspace(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).compile.post()) as LatexCompileOutcome,
		onSettled: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.workspaceBuild(workspaceId()) });
		}
	}));
}

export function useSectionAnnotations(
	sectionId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionAnnotations(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).annotations.get()) as AnnotationView[]
	}));
}

export function useCreateAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			kind: 'highlight' | 'pin';
			page: number;
			rects: AnnotationRect[];
			selectedText?: string;
			note?: string;
		}) => unwrap(await api.sections({ id: sectionId() }).annotations.post(input)) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useUpdateAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			annotationId: string;
			note?: string | null;
			status?: 'open' | 'dismissed';
		}) =>
			unwrap(
				await api
					.sections({ id: sectionId() })
					.annotations({ aid: input.annotationId })
					.patch({ note: input.note, status: input.status })
			) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useDeleteAnnotation(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (annotationId: string) =>
			unwrap(
				await api.sections({ id: sectionId() }).annotations({ aid: annotationId }).delete()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useMarkAnnotationsSent(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; threadId: string; messageId?: string }) =>
			unwrap(await api.sections({ id: sectionId() }).annotations['mark-sent'].post(input)) as {
				ok: true;
			},
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export type ProposalHunk = {
	index: number;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
};

export type PendingProposalView = {
	id: string;
	sectionId: string;
	baseVersion: number;
	proposedSource: string;
	summary: string;
	annotationIds: string[];
	threadId: string | null;
	createdAt: number;
	currentSource: string;
	currentVersion: number;
	isStale: boolean;
	hunks: ProposalHunk[];
} | null;

export type AcceptProposalResult =
	| { status: 'accepted'; contentVersion: number }
	| { status: 'stale'; currentVersion: number }
	| { status: 'compile_error'; compileErrors: LatexCompileError[] };

export function usePendingProposal(sectionId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.sectionProposal(sectionId()),
		enabled: enabled() && Boolean(sectionId()),
		queryFn: async () =>
			unwrap(await api.sections({ id: sectionId() }).proposals.get()) as PendingProposalView
	}));
}

export function useAcceptProposal(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { proposalId: string; acceptedHunkIndexes?: number[] }) =>
			unwrap(
				await api
					.sections({ id: sectionId() })
					.proposals({ pid: input.proposalId })
					.accept.post(
						input.acceptedHunkIndexes
							? { acceptedHunkIndexes: input.acceptedHunkIndexes }
							: undefined
					)
			) as AcceptProposalResult,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionDocument(sectionId()) });
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}

export function useRejectProposal(sectionId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (proposalId: string) =>
			unwrap(
				await api.sections({ id: sectionId() }).proposals({ pid: proposalId }).reject.post()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.sectionProposal(sectionId()) });
			void qc.invalidateQueries({
				queryKey: queryKeys.workspaces.sectionAnnotations(sectionId())
			});
		}
	}));
}
