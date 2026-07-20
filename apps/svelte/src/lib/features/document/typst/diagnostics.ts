import type { TypstRawDiagnostic } from './types';

export type Cm6Severity = 'error' | 'warning' | 'info';
export type Cm6Diagnostic = {
	from: number;
	to: number;
	severity: Cm6Severity;
	message: string;
};

const RANGE_RE = /^(\d+):(\d+)-(\d+):(\d+)$/;

/** Offset karakter dari (line, col) 1-based pada `source` (di-clamp ke batas dokumen). */
function lineColToOffset(lineStarts: number[], length: number, line: number, col: number): number {
	const li = Math.min(Math.max(line, 1), lineStarts.length) - 1;
	const base = lineStarts[li]!;
	const nextLineStart = li + 1 < lineStarts.length ? lineStarts[li + 1]! : length + 1;
	// col 1-based → offset col-1 char ke dalam baris; clamp agar tak melewati baris.
	return Math.min(base + Math.max(col - 1, 0), nextLineStart - 1, length);
}

function severityOf(raw: string): Cm6Severity {
	return raw === 'warning' ? 'warning' : raw === 'error' ? 'error' : 'info';
}

/**
 * Petakan diagnostik typst.ts (`range` = `line:col-line:col`, 1-based) ke bentuk CM6 lint
 * (`{from,to}` = offset karakter). Murni atas `source` (bukan CM6 Text) supaya bisa diuji di node.
 * Diagnostik tanpa range valid dipetakan ke offset 0.
 */
export function mapTypstDiagnostics(
	diagnostics: TypstRawDiagnostic[],
	source: string
): Cm6Diagnostic[] {
	// Offset awal tiap baris.
	const lineStarts: number[] = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === '\n') lineStarts.push(i + 1);
	}
	const length = source.length;

	return diagnostics.map((d) => {
		const m = RANGE_RE.exec(d.range.trim());
		if (!m) {
			return { from: 0, to: 0, severity: severityOf(d.severity), message: d.message };
		}
		const from = lineColToOffset(lineStarts, length, Number(m[1]), Number(m[2]));
		const to = lineColToOffset(lineStarts, length, Number(m[3]), Number(m[4]));
		return {
			from: Math.min(from, to),
			to: Math.max(from, to),
			severity: severityOf(d.severity),
			message: d.message
		};
	});
}
