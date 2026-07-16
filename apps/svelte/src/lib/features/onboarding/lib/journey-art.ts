// Deterministic geometry for the onboarding journey illustrations. Pure module (no runes, no
// DOM): the starfield and constellation are data; components only render them. Fixed seed keeps
// the decorative field identical across renders and both themes.

import type { InterestId } from './onboarding-options';

export type FieldStar = { x: number; y: number; r: number; o: number };

/** Shared 12×12 star glyph path used by InterestChip and FinishStep chips. */
export const INTEREST_STAR_GLYPH =
	'M6 0.8 L7.3 4.7 L11.2 6 L7.3 7.3 L6 11.2 L4.7 7.3 L0.8 6 L4.7 4.7 Z';

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function buildStarfield(count: number, width: number, height: number, seed = 7): FieldStar[] {
	const rand = mulberry32(seed);
	return Array.from({ length: count }, () => ({
		x: Math.round(rand() * width * 10) / 10,
		y: Math.round(rand() * height * 10) / 10,
		r: 0.5 + rand() * 1.1,
		o: 0.2 + rand() * 0.45
	}));
}

export const CONSTELLATION_VIEWBOX = { width: 320, height: 260 } as const;

/** Hand-placed star per interest id inside CONSTELLATION_VIEWBOX. Exhaustive over InterestId. */
export const INTEREST_STARS = {
	ai_cs: { x: 54, y: 58 },
	kesehatan: { x: 148, y: 36 },
	biologi: { x: 244, y: 52 },
	fisika: { x: 294, y: 96 },
	kimia: { x: 208, y: 104 },
	matematika: { x: 112, y: 92 },
	teknik: { x: 36, y: 128 },
	ekonomi: { x: 160, y: 148 },
	psikologi: { x: 262, y: 158 },
	sosial_politik: { x: 86, y: 180 },
	pendidikan: { x: 188, y: 196 },
	lingkungan: { x: 286, y: 208 },
	hukum: { x: 40, y: 212 },
	neuroscience: { x: 132, y: 224 },
	linguistik: { x: 230, y: 228 }
} as const satisfies Record<InterestId, { x: number; y: number }>;

export type ConstellationSegment = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	key: string;
};

function starAt(id: string): { x: number; y: number } | undefined {
	return Object.hasOwn(INTEREST_STARS, id) ? INTEREST_STARS[id as InterestId] : undefined;
}

/** Lines linking selected stars in selection order; unknown ids are skipped, never rendered raw. */
export function constellationSegments(selected: string[]): ConstellationSegment[] {
	const points = selected
		.map((id) => {
			const at = starAt(id);
			return at ? { id, at } : null;
		})
		.filter((point): point is { id: string; at: { x: number; y: number } } => point !== null);
	const segments: ConstellationSegment[] = [];
	for (let i = 1; i < points.length; i += 1) {
		const a = points[i - 1]!;
		const b = points[i]!;
		segments.push({ x1: a.at.x, y1: a.at.y, x2: b.at.x, y2: b.at.y, key: `${a.id}→${b.id}` });
	}
	return segments;
}
