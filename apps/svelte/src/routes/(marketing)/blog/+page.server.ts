import type { PageServerLoad } from './$types';
import { createPageMetadata } from '$lib/seo';
import { publishedPosts } from '$lib/features/blog/lib/posts';

/** Blog index — SSR-first; static content, siteUrl from runtime env. */
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
