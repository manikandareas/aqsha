import type { DehydratedState } from '@tanstack/svelte-query';

export type DeferredQueryError = {
	code: 'deferred_query_failed';
	message: string;
};

export type DeferredQueryResult =
	{ ok: true; state: DehydratedState } | { ok: false; error: DeferredQueryError };

export type QueryBootstrap = {
	id: string;
	critical: DehydratedState;
	deferred: Record<string, Promise<DeferredQueryResult>>;
};

function stableRecord(value: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
	);
}

export function queryBootstrapId(routeId: string, params: Record<string, string> = {}): string {
	return `${routeId}:${JSON.stringify(stableRecord(params))}`;
}

export async function deferredQueryResult(
	load: () => Promise<DehydratedState>,
	fallback = 'Data belum dapat dimuat.'
): Promise<DeferredQueryResult> {
	try {
		return { ok: true, state: await load() };
	} catch {
		return {
			ok: false,
			error: { code: 'deferred_query_failed', message: fallback }
		};
	}
}
