import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { getApiClient } from '$lib/api';
import { queryKeys, unwrap } from '$lib/query';
import type { AnnotationRect } from './lib/annotation-selection';

const alwaysTrue = () => true;

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
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.documentBib(workspaceId()) });
		}
	}));
}

/** BibTeX proyek (`refs.bib`) untuk compile preview di klien; paritas dengan compile/ekspor server. */
export function useWorkspaceBib(workspaceId: () => string, enabled: () => boolean = alwaysTrue) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.documentBib(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).document.bib.get()) as { bib: string }
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

// ── Anotasi preview dokumen ────────────────────────────────────────────────

export type AnnotationView = {
	id: string;
	kind: 'highlight' | 'pin';
	page: number;
	rects: AnnotationRect[];
	selectedText: string | null;
	note: string | null;
	status: 'open' | 'sent' | 'resolved' | 'dismissed';
	threadId: string | null;
	messageId: string | null;
	createdAt: number;
	updatedAt: number;
};

export function useWorkspaceAnnotations(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.annotations(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).annotations.get()) as AnnotationView[]
	}));
}

export function useCreateAnnotation(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			kind: 'highlight' | 'pin';
			page: number;
			rects: AnnotationRect[];
			selectedText?: string;
			note?: string;
		}) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).annotations.post(input)
			) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
		}
	}));
}

export function useUpdateAnnotation(workspaceId: () => string) {
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
					.workspaces({ id: workspaceId() })
					.annotations({ aid: input.annotationId })
					.patch({ note: input.note, status: input.status })
			) as AnnotationView,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
		}
	}));
}

export function useDeleteAnnotation(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (annotationId: string) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).annotations({ aid: annotationId }).delete()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
		}
	}));
}

export function useMarkAnnotationsSent(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { ids: string[]; threadId: string; messageId?: string }) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).annotations['mark-sent'].post(input)
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
		}
	}));
}

// ── Proposal suntingan Astra ───────────────────────────────────────────────

export type TypstCompileError = {
	file: string;
	line: number;
	message: string;
	severity: 'error' | 'warning';
};

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
	workspaceId: string;
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
	| { status: 'compile_error'; compileErrors: TypstCompileError[] };

export function usePendingProposal(
	workspaceId: () => string,
	enabled: () => boolean = alwaysTrue
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.workspaces.proposals(workspaceId()),
		enabled: enabled() && Boolean(workspaceId()),
		queryFn: async () =>
			unwrap(await api.workspaces({ id: workspaceId() }).proposals.get()) as PendingProposalView
	}));
}

export function useAcceptProposal(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { proposalId: string; acceptedHunkIndexes?: number[] }) =>
			unwrap(
				await api
					.workspaces({ id: workspaceId() })
					.proposals({ pid: input.proposalId })
					.accept.post(
						input.acceptedHunkIndexes ? { acceptedHunkIndexes: input.acceptedHunkIndexes } : undefined
					)
			) as AcceptProposalResult,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.document(workspaceId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.documentBib(workspaceId()) });
		}
	}));
}

export function useRejectProposal(workspaceId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (proposalId: string) =>
			unwrap(
				await api.workspaces({ id: workspaceId() }).proposals({ pid: proposalId }).reject.post()
			) as { ok: true },
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.proposals(workspaceId()) });
			void qc.invalidateQueries({ queryKey: queryKeys.workspaces.annotations(workspaceId()) });
		}
	}));
}
