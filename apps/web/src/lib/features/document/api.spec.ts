import { describe, expect, it } from 'vitest';
import { normalizePendingProposal } from './api';

describe('normalizePendingProposal', () => {
	it('menerima null dan proposal dengan collection yang dibutuhkan UI', () => {
		expect(normalizePendingProposal(null)).toBeNull();

		const proposal = { id: 'proposal-1', hunks: [], remainingHunks: [], annotationIds: [] };
		expect(normalizePendingProposal(proposal)).toBe(proposal);
	});

	it('mengabaikan response lama yang belum memiliki hunks', () => {
		expect(normalizePendingProposal({ id: 'proposal-1', annotationIds: [] })).toBeNull();
	});

	it('mengabaikan response lama yang belum memiliki sisa hunk', () => {
		expect(
			normalizePendingProposal({ id: 'proposal-1', hunks: [], annotationIds: [] })
		).toBeNull();
	});
});
