import { infiniteQueryOptions, queryOptions } from '@tanstack/svelte-query';
import type { ApiClient } from '@aqsha/api/client';
import { queryKeys, unwrap } from '$lib/query';
import type { Workspace, WorkspaceListItem } from './types';

export const WORKSPACE_LIST_PAGE_SIZE = 25;

export type WorkspaceListPage = {
	items: WorkspaceListItem[];
	nextCursor: string | null;
};

export function workspaceDetailQueryOptions(
	api: ApiClient,
	params: { id: string; enabled: boolean }
) {
	return queryOptions({
		queryKey: queryKeys.workspaces.detail(params.id),
		enabled: params.enabled && Boolean(params.id),
		queryFn: async () => unwrap(await api.workspaces({ id: params.id }).get()) as Workspace
	});
}

export function workspaceListQueryOptions(
	api: ApiClient,
	params: { includeArchived: boolean; enabled: boolean }
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.workspaces.list({ includeArchived: params.includeArchived }),
		enabled: params.enabled,
		initialPageParam: null as string | null,
		queryFn: async ({ pageParam }) =>
			unwrap(
				await api.workspaces.get({
					query: {
						limit: WORKSPACE_LIST_PAGE_SIZE,
						includeArchived: params.includeArchived,
						...(pageParam ? { cursor: pageParam } : {})
					}
				})
			) as WorkspaceListPage,
		getNextPageParam: (last: WorkspaceListPage) => last.nextCursor
	});
}
