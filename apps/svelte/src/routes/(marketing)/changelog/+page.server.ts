import type { PageServerLoad } from './$types';
import { createPageMetadata } from '$lib/seo';
import { publishedEntries } from '$lib/features/changelog/lib/entries';

/** Padanan `apps/web/app/changelog/page.tsx`. SSR-first (§3.6). */
export const load: PageServerLoad = () => {
	return {
		entries: publishedEntries(),
		seo: createPageMetadata({
			title: 'Apa yang baru',
			description:
				'Fitur baru, peningkatan, dan perbaikan terbaru di Aqsha — asisten AI buat riset yang sumbernya beneran dicek.',
			path: '/changelog'
		})
	};
};
