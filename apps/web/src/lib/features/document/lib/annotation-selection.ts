/**
 * Geometri anotasi atas preview SVG Typst. Anchor kanonik anotasi = `selectedText`; `page` + `rects`
 * hanya untuk menggambar sorotan. `rects` disimpan ternormalisasi (0..1) relatif kotak halaman
 * supaya overlay tahan zoom & recompile (kotak halaman diukur ulang saat render).
 */

export type AnnotationRect = { x: number; y: number; w: number; h: number };

/** Calon anotasi (blok semantik terpilih di mode anotasi, sebelum dipersist). */
export type AnnotationDraft = {
	selectedText: string;
	page: number;
	rects: AnnotationRect[];
};

/** Elemen halaman terurut dalam container preview (fallback: seluruh SVG sebagai satu halaman). */
export function pageElements(container: HTMLElement): Element[] {
	const pages = Array.from(container.querySelectorAll('.typst-page'));
	if (pages.length > 0) return pages;
	const svg = container.querySelector('svg');
	return svg ? [svg] : [];
}

export type OverlayBox = { left: number; top: number; width: number; height: number };

/** Rects ternormalisasi halaman `page` → kotak px relatif `stageEl` (untuk overlay sorotan). */
export function overlayBoxes(
	container: HTMLElement,
	stageEl: HTMLElement,
	page: number,
	rects: AnnotationRect[]
): OverlayBox[] {
	const pages = pageElements(container);
	const pageEl = pages[page - 1];
	if (!pageEl) return [];
	const pageBox = pageEl.getBoundingClientRect();
	const stageBox = stageEl.getBoundingClientRect();
	return rects.map((r) => ({
		left: pageBox.left - stageBox.left + r.x * pageBox.width,
		top: pageBox.top - stageBox.top + r.y * pageBox.height,
		width: r.w * pageBox.width,
		height: r.h * pageBox.height
	}));
}
