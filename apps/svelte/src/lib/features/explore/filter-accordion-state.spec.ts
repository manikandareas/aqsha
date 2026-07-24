import { describe, expect, it } from 'vitest';
import { reconcileFilterAccordionState } from './filter-accordion-state';

const categories = [
	{ id: 'publication' as const, label: 'Publikasi' },
	{ id: 'impact' as const, label: 'Dampak' }
];

describe('reconcileFilterAccordionState', () => {
	it('opens Publikasi when the async catalog first becomes available', () => {
		const empty = reconcileFilterAccordionState(
			{ initialized: false, open: {} },
			[]
		);
		expect(empty).toEqual({ initialized: false, open: {} });
		expect(reconcileFilterAccordionState(empty, categories)).toEqual({
			initialized: true,
			open: { publication: true }
		});
	});

	it('keeps a category closed after the user deliberately closes it', () => {
		const closed = { initialized: true, open: { publication: false, impact: true } };
		expect(reconcileFilterAccordionState(closed, categories)).toEqual(closed);
	});
});
