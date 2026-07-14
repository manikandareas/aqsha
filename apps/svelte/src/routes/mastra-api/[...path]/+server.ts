import type { RequestHandler } from './$types';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';

/**
 * Streaming Mastra proxy (`/mastra-api/*`) → `@aqsha/agent` (Hono Mastra server). Port of
 * `apps/web/app/mastra-api/[...path]/route.ts`.
 *
 * `@mastra/client-js` is configured `apiPrefix:'/mastra-api'` (same-origin) → this rewrites the
 * prefix `/mastra-api` → `/api` (Mastra server default apiPrefix) and forwards to
 * `MASTRA_AGENT_ORIGIN`.
 *
 * WHY raw `node:http` (not `fetch`): Node's `fetch`/undici imposes a ~300s body idle-timeout; a
 * long-lived Mastra stream (e.g. `/deep`) can sit quiet longer → undici aborts → progress freezes.
 * A `node:http` socket with `setTimeout(0)` has no idle-timeout, and the body is piped incrementally
 * (`Readable.toWeb`, preserving backpressure). The Clerk bearer is forwarded as-is; Mastra's
 * `server.auth` (MastraAuthClerk) verifies it — the `/mastra-api` route is intentionally NOT behind
 * the Clerk server gate (see `hooks.server.ts`), which only guards `/app`.
 *
 * NB: SvelteKit CSRF (origin check) only applies to form content-types; Mastra posts JSON, so it is
 * exempt. adapter-node streams `ReadableStream` bodies through without buffering.
 */
const AGENT_ORIGIN = env.MASTRA_AGENT_ORIGIN ?? 'http://localhost:4111';

const DROP_REQUEST_HEADERS = new Set([
	'host',
	'connection',
	'content-length',
	'transfer-encoding',
	'keep-alive',
	// Response is forwarded WITHOUT content-encoding (stripped below) → upstream must not be allowed
	// to compress, or a compressor in front of the agent would send gzip bytes with no header.
	'accept-encoding'
]);
const DROP_RESPONSE_HEADERS = new Set([
	'content-length',
	'content-encoding',
	'transfer-encoding',
	'connection',
	'keep-alive'
]);

const proxy: RequestHandler = async ({ request, url }) => {
	const origin = new URL(AGENT_ORIGIN);
	const transport = origin.protocol === 'https:' ? https : http;

	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) headers[key] = value;
	});

	const body =
		request.method === 'GET' || request.method === 'HEAD'
			? undefined
			: Buffer.from(await request.arrayBuffer());
	if (body) headers['content-length'] = String(body.byteLength);

	// `/mastra-api/<rest>` → `/api/<rest>` (Mastra server apiPrefix).
	const targetPath = `${url.pathname.replace(/^\/mastra-api/, '/api')}${url.search}`;

	return await new Promise<Response>((resolve, reject) => {
		const upstream = transport.request(
			{
				protocol: origin.protocol,
				hostname: origin.hostname,
				port: origin.port || undefined,
				method: request.method,
				path: targetPath,
				headers
			},
			(res) => {
				const status = res.statusCode ?? 502;
				const resHeaders = new Headers();
				for (const [key, value] of Object.entries(res.headers)) {
					if (value === undefined || DROP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
					resHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
				}
				resHeaders.set('x-accel-buffering', 'no'); // nginx: do not buffer the stream
				resolve(
					new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
						status,
						statusText: res.statusMessage,
						headers: resHeaders
					})
				);
			}
		);

		upstream.setTimeout(0); // no idle-timeout: a long-lived stream may sit quiet for minutes
		upstream.on('error', reject);
		request.signal.addEventListener('abort', () => upstream.destroy(), { once: true });

		if (body) upstream.write(body);
		upstream.end();
	});
};

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
