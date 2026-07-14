import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { forwardToAgent } from './proxy';

/**
 * Test proxy Mastra (plan §Phase 2 task 6 / DoD): header rules, path rewrite, first-byte streaming,
 * abort propagation, large payload — terhadap upstream `node:http` sungguhan (socket nyata).
 * `forwardToAgent` sengaja env-free → tak memicu boot validation `serverEnv`.
 */
function startUpstream(
	handler: http.RequestListener
): Promise<{ origin: string; close: () => void }> {
	return new Promise((resolve) => {
		const server = http.createServer(handler);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
		});
	});
}

const decoder = new TextDecoder();

describe('forwardToAgent', () => {
	it('rewrite /mastra-api → /api, forward header non-drop, strip accept-encoding & response encoding', async () => {
		let receivedUrl = '';
		let receivedHeaders: http.IncomingHttpHeaders = {};
		const { origin, close } = await startUpstream((req, res) => {
			receivedUrl = req.url ?? '';
			receivedHeaders = req.headers;
			res.setHeader('content-encoding', 'gzip'); // harus di-strip
			res.setHeader('content-length', '2'); // harus di-strip
			res.setHeader('x-custom-res', 'yes');
			res.end('ok');
		});

		const request = new Request('http://localhost/mastra-api/agents/x/generate', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip', 'x-req': 'abc' },
			body: JSON.stringify({ hi: 1 })
		});
		const res = await forwardToAgent(
			request,
			new URL('http://localhost/mastra-api/agents/x/generate?q=1'),
			origin
		);

		expect(receivedUrl).toBe('/api/agents/x/generate?q=1'); // rewrite + search preserved
		expect(receivedHeaders['x-req']).toBe('abc'); // header non-drop diteruskan
		expect(receivedHeaders['accept-encoding']).toBeUndefined(); // di-drop (anti gzip mismatch)
		expect(res.headers.get('content-encoding')).toBeNull(); // di-strip
		expect(res.headers.get('content-length')).toBeNull(); // di-strip
		expect(res.headers.get('x-custom-res')).toBe('yes'); // header lain lolos
		expect(res.headers.get('x-accel-buffering')).toBe('no'); // anti-buffer nginx
		expect(await res.text()).toBe('ok');
		close();
	});

	it('first-byte streaming: chunk pertama tiba sebelum upstream selesai (tak di-buffer)', async () => {
		const { origin, close } = await startUpstream((_req, res) => {
			res.write('chunk1');
			setTimeout(() => {
				res.write('chunk2');
				res.end();
			}, 150);
		});

		const res = await forwardToAgent(
			new Request('http://localhost/mastra-api/stream'),
			new URL('http://localhost/mastra-api/stream'),
			origin
		);
		const reader = res.body!.getReader();

		const t0 = Date.now();
		const first = await reader.read();
		const firstAt = Date.now() - t0;

		expect(decoder.decode(first.value)).toContain('chunk1');
		expect(firstAt).toBeLessThan(100); // < 150ms delay chunk2 → streaming inkremental terbukti

		let rest = '';
		for (;;) {
			const r = await reader.read();
			if (r.done) break;
			rest += decoder.decode(r.value);
		}
		expect(rest).toContain('chunk2');
		close();
	});

	it('abort request → upstream socket di-destroy (propagasi abort)', async () => {
		let upstreamClosed = false;
		const { origin, close } = await startUpstream((req, res) => {
			const mark = () => {
				upstreamClosed = true;
			};
			req.on('close', mark);
			res.on('close', mark);
			res.write('open'); // long-lived: tak pernah end
		});

		const controller = new AbortController();
		const res = await forwardToAgent(
			new Request('http://localhost/mastra-api/stream', { signal: controller.signal }),
			new URL('http://localhost/mastra-api/stream'),
			origin
		);
		const reader = res.body!.getReader();
		await reader.read(); // pastikan koneksi terjalin

		controller.abort();
		reader.cancel().catch(() => {});

		await vi.waitFor(() => expect(upstreamClosed).toBe(true), { timeout: 1000 });
		close();
	});

	it('large payload (~1MB) diteruskan utuh', async () => {
		const { origin, close } = await startUpstream((req, res) => {
			let len = 0;
			req.on('data', (chunk: Buffer) => {
				len += chunk.length;
			});
			req.on('end', () => res.end(String(len)));
		});

		const big = 'x'.repeat(1_000_000);
		const res = await forwardToAgent(
			new Request('http://localhost/mastra-api/upload', { method: 'POST', body: big }),
			new URL('http://localhost/mastra-api/upload'),
			origin
		);
		expect(await res.text()).toBe(String(1_000_000));
		close();
	});
});
