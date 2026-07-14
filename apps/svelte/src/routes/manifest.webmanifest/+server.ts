import type { RequestHandler } from './$types';
import { buildWebManifest } from '$lib/seo/handlers';

/** Padanan `apps/web/app/manifest.ts`. Public (allow-list `hooks.server.ts`). */
export const GET: RequestHandler = () => {
	return new Response(JSON.stringify(buildWebManifest()), {
		headers: {
			'content-type': 'application/manifest+json; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
