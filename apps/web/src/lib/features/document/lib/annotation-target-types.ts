import type { AnnotationRect } from './annotation-selection';

export type SemanticBlockKind = 'judul' | 'paragraf' | 'daftar' | 'baris' | 'pilihan';

export type SemanticBlockSelection =
	| { renderer: 'semantic-layer'; start: number; end: number }
	| {
			renderer: 'vedivad';
			start: number;
			end: number;
			sourceStartLine: number;
			sourceEndLine: number;
	  };

export type SemanticBlock = {
	page: number;
	kind: SemanticBlockKind;
	/** Teks badge hover: judul outline yang cocok, selain itu cuplikan teks blok. */
	label: string;
	/** Anchor kanonik (`selectedText`) — gabungan teks baris blok. */
	text: string;
	/** Kotak per-baris, ternormalisasi 0..1 relatif kotak halaman. */
	rects: AnnotationRect[];
	/** Union rects — untuk hit-test & outline hover. */
	bbox: AnnotationRect;
	/** Urutan visual/source yang diperlukan untuk memperluas drag menjadi range kontigu. */
	selection: SemanticBlockSelection;
};

export type SemanticRangeResult =
	{ ok: true; block: SemanticBlock } | { ok: false; reason: 'different-page' | 'incompatible' };

/** Fragmen teks mentah (px viewport) — satu `foreignObject.tsel`. */
export type TextFragment = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	text: string;
	fontSize: number;
};

export type Line = TextFragment;

/** Blok hasil grouping, masih dalam px viewport (sebelum normalisasi halaman). */
export type RawBlock = {
	kind: SemanticBlockKind;
	label: string;
	text: string;
	lines: Line[];
};
