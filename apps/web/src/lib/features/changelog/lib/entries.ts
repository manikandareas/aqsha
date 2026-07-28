import { allChangelogs } from 'content-collections';

import type { ChangelogEntry } from '../types';

/** Entri non-draft, terbaru dulu — satu sumber untuk timeline, teaser, & sitemap. */
export function publishedEntries(): ChangelogEntry[] {
	return allChangelogs
		.filter((entry) => !entry.draft)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Lookup satu entri non-draft by slug (undefined kalau draft / tidak ada). */
export function getPublishedEntry(slug: string): ChangelogEntry | undefined {
	return allChangelogs.find((entry) => entry.slug === slug && !entry.draft);
}
