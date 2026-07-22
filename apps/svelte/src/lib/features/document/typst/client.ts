import { browser } from '$app/environment';
import { type Cm6Diagnostic, mapTypstDiagnostics } from './diagnostics';
import type { TypstWorkerRequest, TypstWorkerResponse } from './types';

export type TypstCompiledResult = {
	/** SVG siap-DOM dari worker (null bila compile gagal total). */
	svg: string | null;
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
	#onError: ((message: string) => void) | null = null;
	#debounceMs: number;
	#compileTimeoutMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#compileTimer: ReturnType<typeof setTimeout> | null = null;
	#mainFilePath: string;
	#pending: { seq: number; source: string; bib: string | null; mainFilePath: string } | null =
		null;

	constructor(
		opts: { debounceMs?: number; compileTimeoutMs?: number; mainFilePath?: string } = {}
	) {
		this.#debounceMs = opts.debounceMs ?? 300;
		this.#compileTimeoutMs = opts.compileTimeoutMs ?? 30_000;
		this.#mainFilePath = opts.mainFilePath ?? '/main.typ';
		if (!browser) return;
		this.#worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		this.#worker.onmessage = (e: MessageEvent<TypstWorkerResponse>) => {
			const msg = e.data;
			// Buang respons basi: hanya render hasil dari update terakhir yang dikirim.
			if (msg.type === 'compiled' && msg.seq === this.#seq) {
				this.#clearCompileTimer();
				this.#onCompiled?.({
					svg: msg.svg,
					diagnostics: mapTypstDiagnostics(msg.diagnostics, this.#lastSource)
				});
			} else if (msg.type === 'error' && msg.seq === this.#seq) {
				this.#clearCompileTimer();
				this.#onError?.(msg.message);
			}
		};
		this.#worker.onerror = (event) => {
			event.preventDefault();
			this.#fail(event.message || 'Typst worker gagal dimuat.');
		};
		this.#worker.onmessageerror = () => {
			this.#fail('Respons Typst worker tidak dapat dibaca.');
		};
	}

	onCompiled(cb: (r: TypstCompiledResult) => void): void {
		this.#onCompiled = cb;
	}

	onError(cb: (message: string) => void): void {
		this.#onError = cb;
	}

	/** Path virtual berkas utama (mis. `/skripsi.typ`) — dipakai update berikutnya. */
	setMainFilePath(path: string): void {
		this.#mainFilePath = path || '/main.typ';
	}

	/** Kirim sumber terbaru (debounced). `bib` selalu string (kosong = tanpa sitasi). */
	update(source: string, bib: string | null = '', mainFilePath?: string): void {
		if (mainFilePath) this.#mainFilePath = mainFilePath;
		this.#pending = {
			seq: ++this.#seq,
			source,
			bib,
			mainFilePath: this.#mainFilePath
		};
		if (this.#timer) clearTimeout(this.#timer);
		this.#clearCompileTimer();
		this.#timer = setTimeout(() => this.#flush(), this.#debounceMs);
	}

	#flush(): void {
		if (!this.#worker || !this.#pending) return;
		const { seq, source, bib, mainFilePath } = this.#pending;
		this.#pending = null;
		this.#lastSource = source;
		this.#worker.postMessage({
			type: 'update',
			seq,
			source,
			bib,
			mainFilePath
		} satisfies TypstWorkerRequest);
		this.#compileTimer = setTimeout(() => {
			this.#compileTimer = null;
			this.#onError?.('Typst worker tidak merespons tepat waktu.');
		}, this.#compileTimeoutMs);
	}

	#clearCompileTimer(): void {
		if (!this.#compileTimer) return;
		clearTimeout(this.#compileTimer);
		this.#compileTimer = null;
	}

	#fail(message: string): void {
		this.#clearCompileTimer();
		this.#onError?.(message);
	}

	dispose(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#clearCompileTimer();
		this.#worker?.postMessage({ type: 'dispose' } satisfies TypstWorkerRequest);
		this.#worker?.terminate();
		this.#worker = null;
	}
}
