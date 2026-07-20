/// <reference lib="webworker" />
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import { createTypstCompiler, initOptions, loadFonts } from '@myriaddreamin/typst.ts';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';
import type { TypstRawDiagnostic, TypstWorkerRequest, TypstWorkerResponse } from './types';

// Font self-host (ttf/otf; Typst tak membaca woff2). Inter = teks, JetBrains Mono = kode,
// NewCM Math = matematika. Default font assets di-disable → tanpa fetch CDN (offline-safe).
const FONT_URLS = [
	'/fonts/typst/inter-latin-wght-normal.ttf',
	'/fonts/typst/jetbrains-mono-latin-wght-normal.ttf',
	'/fonts/typst/NewCMMath-Regular.otf'
];

let compiler: ReturnType<typeof createTypstCompiler> | null = null;
let renderer: ReturnType<typeof createTypstRenderer> | null = null;
let initPromise: Promise<void> | null = null;
const encoder = new TextEncoder();

function ensureCompiler(): Promise<void> {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		const c = createTypstCompiler();
		const r = createTypstRenderer();
		await Promise.all([
			c.init({
				getModule: () => compilerWasmUrl,
				beforeBuild: [initOptions.disableDefaultFontAssets(), loadFonts(FONT_URLS)]
			}),
			r.init({ getModule: () => rendererWasmUrl })
		]);
		compiler = c;
		renderer = r;
	})().catch((error: unknown) => {
		compiler = null;
		renderer = null;
		initPromise = null;
		throw error;
	});
	return initPromise;
}

function post(msg: TypstWorkerResponse, transfer: Transferable[] = []): void {
	(self as unknown as Worker).postMessage(msg, transfer);
}

self.onmessage = async (e: MessageEvent<TypstWorkerRequest>) => {
	const msg = e.data;
	if (msg.type === 'dispose') {
		compiler = null;
		renderer = null;
		initPromise = null;
		return;
	}
	if (msg.type !== 'update') return;
	try {
		await ensureCompiler();
		const c = compiler!;
		c.addSource('/main.typ', msg.source);
		// refs.bib selalu ada (kosong bila tanpa sitasi) agar #bibliography tak "file not found".
		c.mapShadow('/refs.bib', encoder.encode(msg.bib ?? ''));
		// Format default = vector (artifact yang di-render renderer di main thread).
		const res = await c.compile({ mainFilePath: '/main.typ', diagnostics: 'full' });
		const vector = res.result ?? null;
		const svg = vector
			? await renderer!.runWithSession(async (session) => {
					renderer!.manipulateData({ renderSession: session, action: 'reset', data: vector });
					return renderer!.renderSvg({ renderSession: session });
				})
			: null;
		post({
			type: 'compiled',
			seq: msg.seq,
			svg,
			diagnostics: (res.diagnostics ?? []) as TypstRawDiagnostic[]
		});
	} catch (err) {
		post({
			type: 'error',
			seq: msg.seq,
			message: err instanceof Error ? err.message : String(err)
		});
	}
};

post({ type: 'ready' });
