import type { RequestHandler } from './$types';
import { seoAllowIndexing, siteUrl } from '$lib/seo/config';
import { buildRobotsTxt } from '$lib/seo/handlers';

// Runtime-rendered (not prerendered): output depends on `PUBLIC_SITE_URL` + `PUBLIC_SEO_ALLOW_INDEXING`
// injected at runtime. Prerender would bake build-time values.
export const prerender = false;

/** robots.txt. Public (allow-list `hooks.server.ts`). */
export const GET: RequestHandler = () => {
	const body = buildRobotsTxt({ siteUrl, allowIndexing: seoAllowIndexing });
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=0, must-revalidate'
		}
	});
};
