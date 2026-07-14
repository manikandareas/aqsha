import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicEnv } from '$lib/env/public';
import { parseSentryDsn } from '$lib/observability';

/**
 * Sentry tunnel (plan §Phase 2 task 7; mirror web `tunnelRoute: '/sentry-tunnel'`). Browser SDK
 * mem-POST error envelope ke sini (client `tunnel` option), lalu di-forward ke ingest Sentry, supaya
 * ad/tracker blocker tak diam-diam men-drop event. Route ini PUBLIC (allow-list `hooks.server.ts`).
 *
 * SSRF-guard: hanya envelope dengan DSN == PUBLIC_SENTRY_DSN yang diteruskan (bukan open relay).
 */
export const POST: RequestHandler = async ({ request, fetch }) => {
	const configured = parseSentryDsn(publicEnv.PUBLIC_SENTRY_DSN);
	if (!configured) error(404, 'Sentry tunnel disabled');

	const envelope = await request.text();
	const nl = envelope.indexOf('\n');
	const firstLine = nl === -1 ? envelope : envelope.slice(0, nl);

	let header: { dsn?: string };
	try {
		header = JSON.parse(firstLine) as { dsn?: string };
	} catch {
		error(400, 'Malformed Sentry envelope');
	}

	const incoming = parseSentryDsn(header.dsn);
	if (!incoming || incoming.ingestUrl !== configured.ingestUrl) {
		error(403, 'DSN mismatch');
	}

	const upstream = await fetch(configured.ingestUrl, {
		method: 'POST',
		body: envelope,
		headers: { 'content-type': 'application/x-sentry-envelope' }
	});
	return new Response(null, { status: upstream.status });
};
