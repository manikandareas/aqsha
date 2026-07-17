// Type-only import from the types mirror (not `citations/api`, which never re-exports it) —
// keeps this module free of any runtime dependency on the citations API layer.
import type { ManualCitationFields } from '$lib/features/citations/types';

/**
 * Input minimum "Simpan" citation-first dari hasil pencarian/feed. DOI menang:
 * server me-resolve metadata kanonik; tanpa DOI kirim metadata hasil apa adanya.
 */
export type SourceSaveInput = {
	title: string;
	doi?: string | null;
	url?: string | null;
	authors?: string[];
	year?: number | null;
	venue?: string | null;
};

export function paperToCitationInput(
	source: SourceSaveInput
): { doi: string } | { fields: ManualCitationFields } {
	if (source.doi) return { doi: source.doi };
	return {
		fields: {
			title: source.title,
			...(source.authors?.length
				? { authors: source.authors.map((name) => ({ literal: name })) }
				: {}),
			...(source.year != null ? { publishedYear: source.year } : {}),
			...(source.venue ? { venue: source.venue } : {}),
			...(source.url ? { url: source.url } : {})
		}
	};
}
