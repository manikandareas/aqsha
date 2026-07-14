import type { PageServerLoad } from './$types';
import { createPageMetadata } from '$lib/seo';
import { publishedPosts } from '$lib/features/blog/lib/posts';

/** Padanan `apps/web/app/blog/page.tsx`. SSR-first (§3.6) — konten statis, siteUrl runtime. */
export const load: PageServerLoad = () => {
	return {
		posts: publishedPosts(),
		seo: createPageMetadata({
			title: 'Blog',
			description:
				'Catatan tim Aqsha soal riset, verifikasi sumber, dan cara nulis ilmiah yang sumbernya beneran ada.',
			path: '/blog'
		})
	};
};
