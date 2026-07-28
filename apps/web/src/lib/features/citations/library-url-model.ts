import type { CitationListFilters } from './api';

// State URL /app/library: filter list + referensi yang terbuka di panel detail.
// Full page → URL state (shareable, back-button); beda dari CitationsPanel yang
// sengaja lokal karena berbagi halaman dengan q lain.
export type LibraryUrlState = CitationListFilters & { cite: string | null };

const STATUSES = ['verified', 'needs_review', 'incomplete'] as const;
const SOURCES = ['import', 'provider_sync', 'artifact', 'doi', 'manual'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
	return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function readLibraryUrl(params: URLSearchParams): LibraryUrlState {
	return {
		q: params.get('q') ?? '',
		status: pick(params.get('status'), STATUSES),
		source: pick(params.get('source'), SOURCES),
		tag: params.get('tag'),
		cite: params.get('cite')
	};
}

export function applyLibraryUrl(
	params: URLSearchParams,
	patch: Partial<LibraryUrlState>
): URLSearchParams {
	const next = new URLSearchParams(params);
	for (const key of ['q', 'status', 'source', 'tag', 'cite'] as const) {
		if (!(key in patch)) continue;
		const value = patch[key];
		if (value) next.set(key, value);
		else next.delete(key);
	}
	return next;
}
