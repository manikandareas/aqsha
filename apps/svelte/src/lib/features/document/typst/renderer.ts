import { browser } from '$app/environment';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import type { TypstRenderer } from '@myriaddreamin/typst.ts';

/**
 * Renderer typst.ts (main thread) untuk menggambar artifact vektor hasil compile worker menjadi
 * SVG teks terseleksi. Singleton modul: WASM di-init sekali, reuse lintas mount + tahan HMR.
 * Font tidak dimuat di sini — glyph sudah tertanam di vektor oleh compiler. SSR: tak pernah dipakai
 * (pemanggil ber-guard `browser`).
 */
let rendererPromise: Promise<TypstRenderer> | null = null;

export function getTypstRenderer(): Promise<TypstRenderer> {
	if (!browser) return Promise.reject(new Error('Renderer Typst hanya tersedia di browser'));
	if (!rendererPromise) {
		rendererPromise = (async () => {
			const { createTypstRenderer } = await import('@myriaddreamin/typst.ts/renderer');
			const renderer = createTypstRenderer();
			await renderer.init({ getModule: () => rendererWasmUrl });
			return renderer;
		})();
	}
	return rendererPromise;
}
