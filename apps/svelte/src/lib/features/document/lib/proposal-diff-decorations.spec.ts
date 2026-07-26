import { describe, expect, it } from 'vitest';
import { planDiffDecorations } from './proposal-diff-extension';

const HUNK = {
	index: 0,
	oldStart: 3,
	oldLines: 2,
	newStart: 3,
	newLines: 3,
	lines: [' konteks', '-lama', '+baru satu', '+baru dua', ' ekor']
};

describe('planDiffDecorations', () => {
	it('menaruh action bar di baris awal hunk', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan[0]).toEqual({ kind: 'bar', line: 3, hunkIndex: 0 });
	});

	it('menandai baris yang dihapus pada nomor baris buffer', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan).toContainEqual({ kind: 'removed', line: 4, hunkIndex: 0 });
	});

	it('menyisipkan baris tambahan sesudah baris terakhir yang dikonsumsi', () => {
		const plan = planDiffDecorations(20, [HUNK]);
		expect(plan).toContainEqual({
			kind: 'added',
			line: 4,
			hunkIndex: 0,
			lines: ['baru satu', 'baru dua']
		});
	});

	it('mengabaikan marker no-newline', () => {
		const plan = planDiffDecorations(20, [{ ...HUNK, lines: ['\\ No newline', ' konteks'] }]);
		expect(plan.filter((p) => p.kind !== 'bar')).toEqual([]);
	});

	it('menjepit baris yang melewati akhir dokumen', () => {
		const plan = planDiffDecorations(3, [{ ...HUNK, oldStart: 99 }]);
		expect(plan.every((p) => p.line >= 1 && p.line <= 3)).toBe(true);
	});

	it('mengembalikan rencana kosong tanpa hunk', () => {
		expect(planDiffDecorations(10, [])).toEqual([]);
	});
});
