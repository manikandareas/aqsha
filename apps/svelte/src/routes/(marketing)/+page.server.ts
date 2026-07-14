import type { PageServerLoad } from './$types';
import { buildLandingJsonLd, createPageMetadata } from '$lib/seo';
import { publishedEntries } from '$lib/features/changelog/lib/entries';
import { CATEGORY_META } from '$lib/features/changelog/lib/categories';
import type { LatestUpdate, TeaserLatest } from '$lib/features/marketing/types';

/**
 * Landing (`/`) — padanan `apps/web/app/page.tsx` + `landing-page.tsx`. Data terbaru dibaca dari
 * Content Collections (statis) di server; JSON-LD identitas/FAQ disematkan lewat SeoHead.
 */
export const load: PageServerLoad = () => {
	const entries = publishedEntries();
	const latest = entries[0];

	const latestUpdate: LatestUpdate | null = latest
		? {
				title: latest.title,
				href: latest.url,
				tag: latest.categories[0] ? CATEGORY_META[latest.categories[0]].label : 'Update'
			}
		: null;

	const teaserLatest: TeaserLatest | null = latest
		? {
				href: latest.url,
				title: latest.title,
				publishedAt: latest.publishedAt,
				summary: latest.excerpt
			}
		: null;

	return {
		latestUpdate,
		teaserLatest,
		seo: {
			...createPageMetadata({
				title: 'Asisten AI buat skripsi, tesis & paper',
				description:
					'Aqsha ngecek tiap sumber ke paper aslinya — jadi kamu nggak ketahuan pas sidang atau direview dosen. Cari jurnal, nulis bareng Astra, semua di satu tempat.',
				path: '/'
			}),
			jsonLd: [buildLandingJsonLd()]
		}
	};
};
