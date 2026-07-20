import { browser } from '$app/environment';
import { type Cm6Diagnostic, mapTypstDiagnostics } from './diagnostics';
import type { TypstWorkerRequest, TypstWorkerResponse } from './types';

export type TypstCompiledResult = {
	/** Artifact vektor typst untuk di-render (null bila compile gagal total). */
	vector: Uint8Array | null;
	diagnostics: Cm6Diagnostic[];
};

/**
 * Wrapper main-thread untuk worker compile Typst WASM. Debounce update (~300 ms), hanya proses
 * respons dari seq terakhir (buang hasil basi), dan petakan diagnostik ke posisi CM6 memakai
 * sumber yang benar-benar di-compile. SSR-guard: tanpa `browser`, semua no-op.
 */
export class TypstClient {
	#worker: Worker | null = null;
	#seq = 0;
	#lastSource = '';
	#onCompiled: ((r: TypstCompiledResult) => void) | null = null;
	#debounceMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#pending: { source: string; bib: string | null } | null = null;

	constructor(opts: { debounceMs?: number } = {}) {
		this.#debounceMs = opts.debounceMs ?? 300;
		if (!browser) return;
		this.#worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		this.#worker.onmessage = (e: MessageEvent<TypstWorkerResponse>) => {
			const msg = e.data;
			// Buang respons basi: hanya render hasil dari update terakhir yang dikirim.
			if (msg.type === 'compiled' && msg.seq === this.#seq) {
				this.#onCompiled?.({
					vector: msg.vector,
					diagnostics: mapTypstDiagnostics(msg.diagnostics, this.#lastSource)
				});
			}
		};
	}

	onCompiled(cb: (r: TypstCompiledResult) => void): void {
		this.#onCompiled = cb;
	}

	/** Kirim sumber terbaru (debounced). `bib` selalu string (kosong = tanpa sitasi). */
	update(source: string, bib: string | null = ''): void {
		this.#pending = { source, bib };
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.#flush(), this.#debounceMs);
	}

	#flush(): void {
		if (!this.#worker || !this.#pending) return;
		const { source, bib } = this.#pending;
		this.#pending = null;
		this.#lastSource = source;
		this.#worker.postMessage({
			type: 'update',
			seq: ++this.#seq,
			source,
			bib
		} satisfies TypstWorkerRequest);
	}

	dispose(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#worker?.postMessage({ type: 'dispose' } satisfies TypstWorkerRequest);
		this.#worker?.terminate();
		this.#worker = null;
	}
}
