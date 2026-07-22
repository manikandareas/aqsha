import { error } from '@sveltejs/kit';
import { dehydrate } from '@tanstack/svelte-query';
import type { PageServerLoad } from './$types';
import { ASTRA_AGENT_ID, createMastraClient } from '$lib/features/threads/lib/mastra-client';
import { mastraMessagesToTimeline } from '$lib/features/threads/lib/mastra-timeline';
import {
	THREAD_HISTORY_BATCH_SIZE,
	chronologicalHistoryBatch,
	historyQueryParams,
	oldestHistoryCursor
} from '$lib/features/threads/lib/thread-history';
import { threadDetailQueryOptions } from '$lib/features/threads/query-options';
import { createQueryClient, queryBootstrapId } from '$lib/query';
import { createServerApiClient } from '$lib/server/api';
import { serverEnv } from '$lib/server/env';

export const load: PageServerLoad = async ({ locals, params }) => {
	const auth = locals.auth();
	const getToken = () => auth.getToken();
	const api = createServerApiClient(getToken);
	const queryClient = createQueryClient({ server: true });
	const mastra = createMastraClient(getToken, {
		baseUrl: serverEnv.MASTRA_AGENT_ORIGIN,
		apiPrefix: '/api'
	});

	const threadPromise = queryClient.fetchQuery(
		threadDetailQueryOptions(api, { id: params.threadId, enabled: true })
	);
	const historyPromise = mastra
		.getMemoryThread({ threadId: params.threadId, agentId: ASTRA_AGENT_ID })
		.listMessages(historyQueryParams());
	const [thread, historyResponse] = await Promise.all([
		threadPromise,
		historyPromise.catch(() => null)
	]);

	if (!thread || (thread.workspaceId && thread.workspaceId !== params.projectId)) {
		error(404, 'Thread tidak ditemukan');
	}
	const raw = chronologicalHistoryBatch(historyResponse?.messages ?? []);

	return {
		threadBootstrap: {
			id: queryBootstrapId(`/app/projects/${params.projectId}/threads/${params.threadId}`),
			critical: dehydrate(queryClient),
			deferred: {}
		},
		historySnapshot: historyResponse
			? {
					messages: mastraMessagesToTimeline(raw),
					oldestCursor: oldestHistoryCursor(raw),
					hasOlder: raw.length === THREAD_HISTORY_BATCH_SIZE
				}
			: null
	};
};
