import { parseStatsGroup, type StatsGroup } from '@aqsha/chat-core/stats-viz';
import {
	createInfiniteQuery,
	createMutation,
	createQuery,
	useQueryClient
} from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { getApiClient } from '$lib/api';
import { apiErrorCode, readableApiErrorMessage } from '$lib/errors';
import { queryKeys, unwrap } from '$lib/query';
import { triggerArtifactDownload, triggerBase64Download } from './lib/artifact-download';
import type { Artifact, ChatThread, ResearchSource } from './types';

/**
 * Thread query/mutation hooks. Each must be called during component init (uses the query + api-client
 * context). Reactive inputs (`threadId`, `enabled`) are passed as getters (svelte-query idiom, see
 * settings/api.ts).
 */

const LIST_PAGE_SIZE = 30;

const always = () => true;

/**
 * List thread (infinite/keyset, DESC activity). `workspaceId` scopes to a project's threads
 * (`null` = global list) — Task 4/7 pass a getter tracking the active workspace.
 */
export function useThreadsList(
	enabled: () => boolean = always,
	workspaceId: () => string | null = () => null
) {
	const api = getApiClient();
	return createInfiniteQuery(() => ({
		queryKey: queryKeys.threads.list(workspaceId()),
		enabled: enabled(),
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }: { pageParam: string | null }) =>
			unwrap(
				await api.threads.get({
					query: {
						limit: LIST_PAGE_SIZE,
						...(workspaceId() ? { workspaceId: workspaceId()! } : {}),
						...(pageParam ? { cursor: pageParam } : {})
					}
				})
			) as { items: ChatThread[]; nextCursor: string | null },
		getNextPageParam: (last: { items: ChatThread[]; nextCursor: string | null }) => last.nextCursor
	}));
}

/**
 * Pinned threads (sidebar "Pinned" group) — full fetch (not infinite), DESC `pinnedAt`. Separate from
 * `useThreadsList` because the main list excludes pinned.
 */
export function usePinnedThreads(enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.pinned(),
		enabled: enabled(),
		queryFn: async () => (unwrap(await api.threads.pinned.get()) as { items: ChatThread[] }).items
	}));
}

/** Detail of one thread (null when not found / not owned). */
export function useThread(id: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.detail(id()),
		enabled: enabled() && Boolean(id()),
		queryFn: async () =>
			(unwrap(await api.threads({ id: id() }).get()) as ChatThread | null) ?? null
	}));
}

/**
 * Send status (Slice 6.2) — UX-friendly pre-check: entitlement preview + cooldown rate-limit,
 * non-consuming. Authoritative backstop = the server Mastra billing precheck processor. Result type is
 * Eden-inferred from `GET /threads/send-status`. `feature='deep_research'` (Slice 7.0) → deep-cap-aware
 * status; key is per-feature so its cache stays separate from the normal_chat pre-check.
 */
export function useSendStatus(
	feature: 'normal_chat' | 'deep_research' = 'normal_chat',
	enabled: () => boolean = always
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.sendStatus(feature),
		enabled: enabled(),
		staleTime: 10_000,
		queryFn: async () =>
			unwrap(
				await api.threads['send-status'].get(
					feature === 'deep_research' ? { query: { feature } } : { query: {} }
				)
			)
	}));
}

/**
 * Thread research sources (Slice 6.4) — persisted by Astra tools (`search_web`/`search_arxiv`/…) to
 * `research_sources`. Persisted per thread → visible on reload (Sources panel). Short `staleTime` so a
 * just-finished turn's sources appear after `onFinish`.
 */
export function useThreadSources(id: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.sources(id()),
		enabled: enabled() && Boolean(id()),
		staleTime: 10_000,
		queryFn: async () =>
			(unwrap(await api.threads({ id: id() }).sources.get()) as { items: ResearchSource[] }).items
	}));
}

/** Result-block group + its originating toolCallId (for per-message scoping in message-list). */
export type ThreadStatsGroup = { toolCallId: string; group: StatsGroup };

/**
 * Thread statistical result blocks — SPSS-style tables + verdict cards + PNG figures persisted
 * persisted outside message text. Used by the FE to resolve `{{stats:<runKey>}}` markers into figures.
 * Invalidated when a turn transitions to `ready` (like `useThreadSources`). Payload parsed with zod
 * (chat-core contract) → corrupt groups are dropped, not fatal to render.
 */
export function useThreadStatsBlocks(id: () => string, enabled: () => boolean = always) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.statsBlocks(id()),
		enabled: enabled() && Boolean(id()),
		staleTime: 10_000,
		queryFn: async () => {
			const items = (
				unwrap(await api.threads({ id: id() })['stats-blocks'].get()) as {
					items: Array<{ toolCallId?: unknown } & Record<string, unknown>>;
				}
			).items;
			const out: ThreadStatsGroup[] = [];
			for (const item of items) {
				const group = parseStatsGroup(item);
				if (group && typeof item.toolCallId === 'string') {
					out.push({ toolCallId: item.toolCallId, group });
				}
			}
			return out;
		}
	}));
}

/**
 * Download the thread bibliography (FEAT-3) — BibTeX/RIS formatted DETERMINISTICALLY server-side from
 * `research_sources` (dedup + alphabetical). One-shot mutation: fetch text → blob → anchor download.
 */
export function useDownloadThreadReferences(threadId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (format: 'bibtex' | 'ris') => {
			const payload = unwrap(
				await api.threads({ id: threadId() }).references.get({ query: { format } })
			) as { fileName: string; mime: string; content: string; count: number };
			if (payload.count === 0) {
				toast.info('Belum ada sumber riset di percakapan ini.');
				return;
			}
			triggerArtifactDownload({
				mime: payload.mime,
				fileName: payload.fileName,
				getText: () => payload.content
			});
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengekspor referensi.'))
	}));
}

/**
 * Export thread analysis results — docx (Bab 4) / xlsx (raw tables) built server-side from
 * server-side from `analysis_result_blocks`, delivered base64 → decode to blob → anchor. Mutation with
 * NO retry (heavy sandbox, expensive non-idempotent); loading state on the panel button. `ok:false`
 * unions (thread with no results, etc.) are already structured appErrors → `readableApiErrorMessage`.
 */
export function useExportAnalysisResults(threadId: () => string) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (format: 'docx' | 'xlsx') => {
			const payload = unwrap(
				await api.threads({ id: threadId() })['analysis-export'].get({ query: { format } })
			) as { fileName: string; mime: string; contentBase64: string };
			triggerBase64Download({
				mime: payload.mime,
				fileName: payload.fileName,
				base64: payload.contentBase64
			});
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengekspor hasil analisis.'))
	}));
}

/**
 * Hydrate `@mention` context (Slice 6.6) — resolve pinned workspace/paper → a compact note + validated
 * ids (ownership checked server-side). Called on submit when there are pins; the result rides as
 * ephemeral `clientContext` into the agent runtime. Mutation (not query): a per-turn one-shot action.
 */
export function useHydrateContext() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			workspaceIds: string[];
			artifactIds: string[];
			paperKeys?: string[];
			feedItemIds?: string[];
			workspaceCitations?: { workspaceId: string; citationId: string }[];
			selections?: { artifactId: string; blockIds: string[]; excerpt: string }[];
		}) => unwrap(await api.threads.context.hydrate.post(input)),
		// C3: hydrate @mention context (workspace/paper) → ephemeral note. Transient failure (network)
		// silently drops the context; a short retry shrinks that window before submit.
		retry: 2,
		retryDelay: (attempt: number) => Math.min(400 * 2 ** attempt, 2_000)
	}));
}

export function useRenameThread() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; title: string }) =>
			unwrap(await api.threads({ id: input.id }).patch({ title: input.title })),
		onSuccess: (_d: unknown, input: { id: string; title: string }) => {
			qc.invalidateQueries({ queryKey: queryKeys.threads.all });
			qc.invalidateQueries({ queryKey: queryKeys.threads.detail(input.id) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengubah judul.'))
	}));
}

export function useDeleteThread() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string }) =>
			unwrap(await api.threads({ id: input.id }).delete()),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.all }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menghapus percakapan.'))
	}));
}

/**
 * Pin / unpin a thread. Invalidate `threads.all` → the main list (excludes pin) + the pinned group
 * re-sync at once. Soft-cap exceeded (backend `pin_limit_reached`, severity warning) → warning toast;
 * other failures → error toast.
 */
export function usePinThread() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { id: string; pinned: boolean }) =>
			unwrap(await api.threads({ id: input.id }).pin.patch({ pinned: input.pinned })),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.all }),
		onError: (e) => {
			if (apiErrorCode(e) === 'pin_limit_reached') {
				toast.warning(readableApiErrorMessage(e, 'Batas sematan tercapai.'));
				return;
			}
			toast.error(readableApiErrorMessage(e, 'Gagal menyematkan thread.'));
		}
	}));
}

/** Artifacts attached to a thread (Slice 6.7) — headless (workspaceId=null). */
export function useThreadArtifacts(
	threadId: () => string | null,
	opts?: { pollWhilePending?: boolean }
) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.threads.artifacts(threadId() ?? ''),
		enabled: Boolean(threadId()),
		queryFn: async () =>
			(unwrap(await api.threads({ id: threadId() ?? '' }).artifacts.get()) as { items: Artifact[] })
				.items,
		// D5: while a large attachment is still `pending` (async indexing), poll until ready/failed.
		refetchInterval: (query: { state: { data?: Artifact[] } }) =>
			opts?.pollWhilePending && (query.state.data ?? []).some((a) => a.indexingStatus === 'pending')
				? 2_500
				: false
	}));
}

/**
 * Remove a still-staged thread attachment (before send) — headless soft-delete. Called when the user
 * removes a composer chip so the pulled file isn't mapped onto the message row (the per-message read
 * join maps attachments via thread + time).
 */
export function useRemoveThreadAttachment(threadId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { artifactId: string }) =>
			unwrap(
				await api.threads({ id: threadId() }).attachments({ artifactId: input.artifactId }).delete()
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.artifacts(threadId()) }),
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mencabut lampiran.'))
	}));
}

/**
 * 3-step thread attachment (Slice 6.7): presign → PUT object storage → finalize (inline extract + RAG
 * index, headless). Thread-scoped variant: ownership = thread (assertOwner route-side), not workspace.
 */
export function useThreadAttachments(threadId: () => string) {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: { file: File }) => {
			const presign = unwrap(
				await api.threads({ id: threadId() }).attachments['upload-url'].post()
			);
			const put = await fetch(presign.uploadUrl, { method: 'PUT', body: input.file });
			if (!put.ok) throw new Error('Gagal mengunggah berkas ke penyimpanan.');
			return unwrap(
				await api.threads({ id: threadId() }).attachments.post({
					key: presign.key,
					fileName: input.file.name,
					mimeType: input.file.type || 'application/octet-stream',
					size: input.file.size
				})
			) as { artifactId: string; title: string; indexed: boolean; indexingStatus: string };
		},
		onSuccess: (data: {
			artifactId: string;
			title: string;
			indexed: boolean;
			indexingStatus: string;
		}) => {
			// D2: warn only when indexing truly FAILED (e.g. scanned PDF / no readable text) — an honest
			// surface, not silent degradation. `pending` (large file, async) isn't done → the chip shows
			// "processing…"; the poll will follow up with a toast if it turns failed.
			if (data.indexingStatus === 'failed') {
				toast.warning(
					'Berkas terlampir, tetapi isinya tak bisa diindeks untuk pencarian (mis. PDF hasil scan / tanpa teks terbaca). Astra dapat membaca metadata, tetapi mungkin tak menemukan isi teksnya.'
				);
			}
			return qc.invalidateQueries({ queryKey: queryKeys.threads.artifacts(threadId()) });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal melampirkan berkas.'))
	}));
}
