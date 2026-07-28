import { queryOptions } from '@tanstack/svelte-query';
import type { ApiClient } from '@aqsha/api/client';
import { queryKeys, unwrap } from '$lib/query';
import type { ChatThread } from './types';

export function threadDetailQueryOptions(api: ApiClient, params: { id: string; enabled: boolean }) {
	return queryOptions({
		queryKey: queryKeys.threads.detail(params.id),
		enabled: params.enabled && Boolean(params.id),
		staleTime: 30_000,
		queryFn: async () =>
			(unwrap(await api.threads({ id: params.id }).get()) as ChatThread | null) ?? null
	});
}
