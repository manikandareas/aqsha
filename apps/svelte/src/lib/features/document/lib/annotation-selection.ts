/**
 * Geometri anotasi atas preview SVG Typst. Anchor kanonik anotasi = `selectedText`; `page` + `rects`
 * hanya untuk menggambar sorotan. `rects` disimpan ternormalisasi (0..1) relatif kotak halaman
 * supaya overlay tahan zoom & recompile (kotak halaman diukur ulang saat render).
 */

export type AnnotationRect = { x: number; y: number; w: number; h: number };

/** Calon anotasi dari seleksi teks (sebelum dipersist). */
export type AnnotationDraft = {
	selectedText: string;
	page: number;
	rects: AnnotationRect[];
};

const MAX_RECTS = 32;
const MAX_SELECTED_TEXT = 2000;
const MIN_RECT_PX = 0.5;

function clamp01(n: number): number {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Elemen halaman terurut dalam container preview (fallback: seluruh SVG sebagai satu halaman). */
export function pageElements(container: HTMLElement): Element[] {
	const pages = Array.from(container.querySelectorAll('.typst-page'));
	if (pages.length > 0) return pages;
	const svg = container.querySelector('svg');
	return svg ? [svg] : [];
}

/** Seleksi teks aktif di dalam container → draft anotasi, atau null bila kosong/di luar preview. */
export function captureSelectionDraft(container: HTMLElement): AnnotationDraft | null {
	if (typeof window === 'undefined') return null;
	const sel = window.getSelection();
	if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
	const text = sel.toString().replace(/\s+/g, ' ').trim();
	if (!text) return null;
	const range = sel.getRangeAt(0);
	if (!container.contains(range.commonAncestorContainer)) return null;

	const pages = pageElements(container);
	if (pages.length === 0) return null;
	const clientRects = Array.from(range.getClientRects()).filter(
		(r) => r.width > MIN_RECT_PX && r.height > MIN_RECT_PX
	);
	if (clientRects.length === 0) return null;

	// Halaman = yang memuat titik tengah rect pertama (fallback halaman pertama).
	const anchor = clientRects[0]!;
	const cy = anchor.top + anchor.height / 2;
	let pageIndex = pages.findIndex((p) => {
		const b = p.getBoundingClientRect();
		return cy >= b.top && cy <= b.bottom;
	});
	if (pageIndex < 0) pageIndex = 0;
	const pageBox = pages[pageIndex]!.getBoundingClientRect();
	if (pageBox.width <= 0 || pageBox.height <= 0) return null;

	const rects = clientRects
		.map((r) => ({
			x: clamp01((r.left - pageBox.left) / pageBox.width),
			y: clamp01((r.top - pageBox.top) / pageBox.height),
			w: clamp01(r.width / pageBox.width),
			h: clamp01(r.height / pageBox.height)
		}))
		.slice(0, MAX_RECTS);

	return { selectedText: text.slice(0, MAX_SELECTED_TEXT), page: pageIndex + 1, rects };
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
