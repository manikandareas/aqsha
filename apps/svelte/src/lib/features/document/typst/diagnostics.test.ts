import { describe, expect, it } from 'vitest';
import { mapTypstDiagnostics } from './diagnostics';

describe('mapTypstDiagnostics', () => {
	const source = 'line satu\nline dua di sini\nline tiga\n';
	// offset baris: 0, 10 ("line dua..."), 26 ("line tiga")

	it('memetakan range line:col-line:col ke offset karakter', () => {
		const out = mapTypstDiagnostics(
			[{ package: '', path: 'main.typ', severity: 'error', range: '2:1-2:5', message: 'salah' }],
			source
		);
		expect(out).toEqual([{ from: 10, to: 14, severity: 'error', message: 'salah' }]);
	});

	it('severity warning dipertahankan', () => {
		const out = mapTypstDiagnostics(
			[{ package: '', path: 'main.typ', severity: 'warning', range: '1:1-1:2', message: 'w' }],
			source
		);
		expect(out[0]!.severity).toBe('warning');
	});

	it('col di luar batas baris di-clamp (tak melewati newline)', () => {
		const out = mapTypstDiagnostics(
			[{ package: '', path: 'main.typ', severity: 'error', range: '1:1-1:999', message: 'x' }],
			source
		);
		// baris 1 "line satu" (9 char) → to di-clamp ke akhir baris (offset 9), bukan menembus newline.
		expect(out[0]!.to).toBe(9);
	});

	it('range tak valid → offset 0', () => {
		const out = mapTypstDiagnostics(
			[{ package: '', path: 'main.typ', severity: 'error', range: 'entah', message: 'x' }],
			source
		);
		expect(out[0]).toEqual({ from: 0, to: 0, severity: 'error', message: 'x' });
	});
});
