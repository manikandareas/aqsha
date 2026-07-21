import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const previewSource = readFileSync(
	new URL('../components/TypstPreview.svelte', import.meta.url),
	'utf8'
);
const workerSource = readFileSync(new URL('./worker.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');

describe('Typst runtime boundary', () => {
	it('menjalankan compiler dan renderer WASM sepenuhnya di worker', () => {
		expect(previewSource).not.toContain('getTypstRenderer');
		expect(previewSource).not.toContain('@myriaddreamin/typst.ts/renderer');
		expect(workerSource).toContain('@myriaddreamin/typst.ts/renderer');
		expect(workerSource).toContain('createTypstRenderer');
		expect(workerSource).toContain('pendingUpdate');
		expect(workerSource).toContain('processing');
		expect(clientSource).toContain("msg.type === 'error'");
		expect(clientSource).toContain('this.#onError?.(msg.message)');
		expect(clientSource).toContain('this.#worker.onerror');
		expect(clientSource).toContain('this.#worker.onmessageerror');
		expect(clientSource).toContain('#compileTimeoutMs');
	});
});
