/**
 * Pure math untuk scroll-linked motion — dipisah dari `scroll.ts` (yang mengimpor `svelte/motion`
 * browser-only) supaya contract-testable di node.
 */

export type ScrollOffset = [string, string]; // mis. ["start end", "start 0.75"]

/** "start"→0, "end"→1, "center"→0.5, angka ("0.75")→parseFloat. */
function parseToken(token: string): number {
	if (token === 'start') return 0;
	if (token === 'end') return 1;
	if (token === 'center') return 0.5;
	const n = Number.parseFloat(token);
	return Number.isFinite(n) ? n : 0;
}

/** C = targetRatio*height − viewportRatio*viewportHeight untuk satu offset "target viewport". */
function pairConst(pair: string, height: number, viewportHeight: number): number {
	const [targetTok, viewportTok] = pair.trim().split(/\s+/);
	const t = parseToken(targetTok);
	const v = parseToken(viewportTok ?? 'start');
	return t * height - v * viewportHeight;
}

/**
 * Progress 0..1 sepanjang perjalanan scroll elemen. 0 = alignment offset[0], 1 = alignment offset[1].
 * Rumus: progress = (rect.top + Cstart) / (Cstart − Cend), di-clamp [0,1].
 */
export function computeScrollProgress(
	rect: { top: number; height: number },
	viewportHeight: number,
	offset: ScrollOffset
): number {
	const cStart = pairConst(offset[0], rect.height, viewportHeight);
	const cEnd = pairConst(offset[1], rect.height, viewportHeight);
	const denom = cStart - cEnd;
	if (denom === 0) return 0;
	const p = (rect.top + cStart) / denom;
	return Math.min(1, Math.max(0, p));
}

/** Interpolasi linier untuk output numerik dari progress scroll. */
export function mapRange(value: number, input: [number, number], output: [number, number]): number {
	const [i0, i1] = input;
	const [o0, o1] = output;
	if (i1 === i0) return o0;
	const t = Math.min(1, Math.max(0, (value - i0) / (i1 - i0)));
	return o0 + (o1 - o0) * t;
}
