import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createPageMetadata } from '$lib/seo';
import { getPublishedEntry } from '$lib/features/changelog/lib/entries';

/** Changelog entry detail — page metadata. */
export const load: PageServerLoad = ({ params }) => {
	const entry = getPublishedEntry(params.slug);
	if (!entry) error(404, { message: 'Halaman tidak ditemukan', code: 'not_found' });

	return {
		entry,
		seo: createPageMetadata({
			title: entry.title,
			description: entry.excerpt,
			path: entry.url
		})
	};
};
