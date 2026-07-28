import { error } from '@sveltejs/kit';
import { dehydrate } from '@tanstack/svelte-query';
import type { LayoutServerLoad } from './$types';
import { workspaceDetailQueryOptions } from '$lib/features/workspaces/query-options';
import type { Workspace } from '$lib/features/workspaces/types';
import { createQueryClient, queryBootstrapId } from '$lib/query';
import { createServerApiClient } from '$lib/server/api';

function statusOf(value: unknown): number | null {
	if (!value || typeof value !== 'object' || !('status' in value)) return null;
	return typeof value.status === 'number' ? value.status : null;
}

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const auth = locals.auth();
	const api = createServerApiClient(() => auth.getToken());
	const queryClient = createQueryClient({ server: true });
	const options = workspaceDetailQueryOptions(api, { id: params.projectId, enabled: true });
	let workspace: Workspace;

	try {
		workspace = await queryClient.fetchQuery(options);
	} catch (cause) {
		if (statusOf(cause) === 404) error(404, 'Proyek tidak ditemukan');
		throw cause;
	}
	if (!workspace) error(404, 'Proyek tidak ditemukan');

	return {
		workspace,
		projectBootstrap: {
			id: queryBootstrapId(`/app/projects/${params.projectId}`),
			critical: dehydrate(queryClient),
			deferred: {}
		}
	};
};
