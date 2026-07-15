import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicEnv } from '$lib/env/public';
import { parseSentryDsn } from '$lib/observability';

/**
 * Sentry tunnel. Browser SDK POSTs error envelopes here (client `tunnel` option), then forwarded to
 * Sentry ingest so ad/tracker blockers do not silently drop events. Route is PUBLIC (allow-list
 * `hooks.server.ts`). SSRF-guard: only envelopes with DSN == PUBLIC_SENTRY_DSN are forwarded.
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
