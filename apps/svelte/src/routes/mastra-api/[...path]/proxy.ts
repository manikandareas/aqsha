import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

/**
 * Core streaming Mastra proxy — dipisah dari `+server.ts` agar `agentOrigin` bisa disuntik (test) &
 * unit-testable tanpa `$env`/`$types`. Port `apps/web/app/mastra-api/[...path]/route.ts`.
 *
 * `@mastra/client-js` dikonfigurasi `apiPrefix:'/mastra-api'` (same-origin) → di sini prefix
 * `/mastra-api` → `/api` (default apiPrefix Mastra) lalu forward ke `agentOrigin`.
 *
 * KENAPA raw `node:http` (bukan `fetch`): `fetch`/undici Node memaksa idle-timeout body ~300s; stream
 * Mastra panjang (mis. `/deep`) bisa diam lebih lama → undici abort → progres freeze. Socket
 * `node:http` dgn `setTimeout(0)` tanpa idle-timeout, body di-pipe inkremental (`Readable.toWeb`,
 * menjaga backpressure). Bearer Clerk diteruskan apa adanya; `server.auth` (MastraAuthClerk) agent
 * yang memverifikasi — route `/mastra-api` sengaja TIDAK di belakang gate Clerk (`hooks.server.ts`).
 *
 * NB: CSRF SvelteKit (origin check) hanya untuk content-type form; Mastra POST JSON → exempt.
 * adapter-node meneruskan body `ReadableStream` tanpa buffering.
 */

const DROP_REQUEST_HEADERS = new Set([
	'host',
	'connection',
	'content-length',
	'transfer-encoding',
	'keep-alive',
	// Response diteruskan TANPA content-encoding (di-strip di bawah) → upstream tak boleh diizinkan
	// meng-kompres, atau kompresor di depan agent akan mengirim byte gzip tanpa header.
	'accept-encoding'
]);
const DROP_RESPONSE_HEADERS = new Set([
	'content-length',
	'content-encoding',
	'transfer-encoding',
	'connection',
	'keep-alive'
]);

/** Forward satu request `/mastra-api/*` ke `agentOrigin` (`/api/*`), streaming, tanpa idle-timeout. */
export async function forwardToAgent(
	request: Request,
	url: URL,
	agentOrigin: string
): Promise<Response> {
	const origin = new URL(agentOrigin);
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
}
