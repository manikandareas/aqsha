import { describe, expect, it } from 'vitest';
import { MAX_CONTEXT_ARTIFACTS } from '$lib/features/threads/lib/context-selection';
import {
	applyMarqueeSelection,
	intersectingTargetIds,
	normalizeMarqueeRect,
	rectsIntersect
} from './workspace-marquee-selection';

describe('workspace marquee selection', () => {
	it('normalizes a rectangle from any drag direction', () => {
		expect(normalizeMarqueeRect({ x: 80, y: 60 }, { x: 20, y: 10 })).toEqual({
			left: 20,
			top: 10,
			right: 80,
			bottom: 60,
			width: 60,
			height: 50
		});
	});

	it('detects intersecting rectangles', () => {
		expect(
			rectsIntersect(
				{ left: 0, top: 0, right: 40, bottom: 40 },
				{ left: 20, top: 20, right: 60, bottom: 60 }
			)
		).toBe(true);
		expect(
			rectsIntersect(
				{ left: 0, top: 0, right: 40, bottom: 40 },
				{ left: 40, top: 40, right: 60, bottom: 60 }
			)
		).toBe(false);
	});

	it('returns target ids that intersect the selection rectangle', () => {
		expect(
			intersectingTargetIds({ left: 0, top: 0, right: 50, bottom: 50 }, [
				{ id: 'a', rect: { left: 10, top: 10, right: 30, bottom: 30 } },
				{ id: 'b', rect: { left: 60, top: 10, right: 80, bottom: 30 } }
			])
		).toEqual(['a']);
	});

	it('adds hit ids without removing existing ids', () => {
		expect(
			applyMarqueeSelection({
				currentIds: ['hidden', 'a'],
				hitIds: ['b', 'c'],
				visibleIds: ['a', 'b', 'c', 'd'],
				mode: 'add'
			})
		).toEqual(['hidden', 'a', 'b', 'c']);
	});

	it('toggles hit ids against existing ids', () => {
		expect(
			applyMarqueeSelection({
				currentIds: ['hidden', 'a', 'b'],
				hitIds: ['b', 'c'],
				visibleIds: ['a', 'b', 'c', 'd'],
				mode: 'toggle'
			})
		).toEqual(['hidden', 'a', 'c']);
	});

	it('caps selection at the context artifact limit in visible order', () => {
		const ids = Array.from(
			{ length: MAX_CONTEXT_ARTIFACTS + 2 },
			(_, index) => `artifact-${index}`
		);

		expect(
			applyMarqueeSelection({
				currentIds: [],
				hitIds: ids,
				visibleIds: ids,
				mode: 'add'
			})
		).toEqual(ids.slice(0, MAX_CONTEXT_ARTIFACTS));
	});
});
