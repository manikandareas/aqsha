import type { RequestHandler } from './$types';
import { seoAllowIndexing, siteUrl } from '$lib/seo/config';
import { buildRobotsTxt } from '$lib/seo/handlers';

// Runtime-rendered (BUKAN prerender): output bergantung `PUBLIC_SITE_URL` + `PUBLIC_SEO_ALLOW_INDEXING`
// yang di-inject Infisical saat runtime (§3.7). Prerender akan mem-bake nilai build → basi.
export const prerender = false;

/** Padanan `apps/web/app/robots.ts`. Public (allow-list `hooks.server.ts`). */
export const GET: RequestHandler = () => {
	const body = buildRobotsTxt({ siteUrl, allowIndexing: seoAllowIndexing });
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=0, must-revalidate'
		}
	});
};
