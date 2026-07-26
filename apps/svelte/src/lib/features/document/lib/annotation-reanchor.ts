import { normalizeHeadingText } from './outline';

/**
 * Cari rentang node teks yang memuat `needle` sesudah kedua sisi dinormalisasi. Lapisan teks SVG
 * Typst memecah kalimat ke banyak node dengan spasi tak konsisten, jadi pencocokan hanya masuk akal
 * pada bentuk ternormalisasi. Murni supaya logikanya dapat diuji tanpa DOM.
 */
export function locateNormalizedText(
	nodeTexts: readonly string[],
	needle: string
): { startNode: number; endNode: number } | null {
	const target = normalizeHeadingText(needle);
	if (!target) return null;
	const starts: number[] = [];
	let acc = '';
	for (const text of nodeTexts) {
		starts.push(acc.length);
		acc += normalizeHeadingText(text);
	}
	const at = acc.indexOf(target);
	if (at < 0) return null;
	const end = at + target.length;
	let startNode = 0;
	let endNode = starts.length - 1;
	for (let i = 0; i < starts.length; i += 1) {
		if (starts[i]! <= at) startNode = i;
		if (starts[i]! < end) endNode = i;
	}
	return { startNode, endNode };
}

/** Seluruh node teks di bawah `root` beserta isinya, dalam urutan dokumen. */
export function buildTextIndex(root: Element): { nodes: Text[]; texts: string[] } {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	const texts: string[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		nodes.push(n as Text);
		texts.push(n.textContent ?? '');
	}
	return { nodes, texts };
}

/** Elemen terdekat yang memuat awal `selectedText`, atau null bila teksnya sudah hilang. */
export function findAnnotationAnchor(root: Element, selectedText: string): Element | null {
	const { nodes, texts } = buildTextIndex(root);
	const hit = locateNormalizedText(texts, selectedText);
	if (!hit) return null;
	return nodes[hit.startNode]?.parentElement ?? null;
}
