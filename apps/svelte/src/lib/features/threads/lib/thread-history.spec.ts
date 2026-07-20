import { describe, expect, it } from 'vitest';
import {
	historyQueryParams,
	chronologicalHistoryBatch,
	prependUniqueById
} from './thread-history';

describe('thread history batches', () => {
	it('turns a newest-first server batch into chronological order', () => {
		const batch = chronologicalHistoryBatch([
			{ id: 'm3', createdAt: new Date(3000) },
			{ id: 'm2', createdAt: new Date(2000) },
			{ id: 'm1', createdAt: new Date(1000) }
		]);

		expect(batch.map((message) => message.id)).toEqual(['m1', 'm2', 'm3']);
	});

	it('uses an exclusive createdAt upper bound for older batches', () => {
		expect(historyQueryParams(1700)).toEqual({
			perPage: 40,
			orderBy: { field: 'createdAt', direction: 'DESC' },
			filter: { dateRange: { end: new Date(1700), endExclusive: true } }
		});
	});

	it('prepends unique older rows by id and skips no-ops', () => {
		const existing = [
			{ id: 'm2', createdAt: 2 },
			{ id: 'm3', createdAt: 3 }
		];
		expect(prependUniqueById(existing, [{ id: 'm1', createdAt: 1 }, { id: 'm2', createdAt: 2 }])).toEqual([
			{ id: 'm1', createdAt: 1 },
			{ id: 'm2', createdAt: 2 },
			{ id: 'm3', createdAt: 3 }
		]);
		expect(prependUniqueById(existing, [{ id: 'm2', createdAt: 2 }])).toBeNull();
		expect(prependUniqueById(existing, [])).toBeNull();
	});
});
