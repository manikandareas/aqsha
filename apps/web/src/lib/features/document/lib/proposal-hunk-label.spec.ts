import { describe, expect, it } from 'vitest';
import { proposalHunkLabel } from './proposal-hunk-label';

describe('proposalHunkLabel', () => {
	it('uses the closest Typst heading before a hunk', () => {
		const source = '= Pendahuluan\n\nSatu.\n\n= Metode\n\nDua.\n';
		expect(
			proposalHunkLabel(source, {
				index: 1,
				oldStart: 6,
				oldLines: 1,
				newStart: 6,
				newLines: 1,
				lines: []
			})
		).toBe('Metode');
	});

	it('falls back to a line range when no heading exists', () => {
		expect(
			proposalHunkLabel('Tanpa heading\n', {
				index: 0,
				oldStart: 1,
				oldLines: 2,
				newStart: 1,
				newLines: 2,
				lines: []
			})
		).toBe('Baris 1–2');
	});
});
