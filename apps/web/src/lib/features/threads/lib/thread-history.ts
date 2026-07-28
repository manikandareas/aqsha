export const THREAD_HISTORY_BATCH_SIZE = 40;

export function historyQueryParams(oldestCursor?: number) {
	return {
		perPage: THREAD_HISTORY_BATCH_SIZE,
		orderBy: { field: 'createdAt' as const, direction: 'DESC' as const },
		...(oldestCursor === undefined
			? {}
			: {
					filter: {
						dateRange: { end: new Date(oldestCursor), endExclusive: true }
					}
				})
	};
}

export function chronologicalHistoryBatch<T>(newestFirst: readonly T[]): T[] {
	return [...newestFirst].reverse();
}

export function oldestHistoryCursor(messages: readonly { createdAt?: unknown }[]): number | null {
	const value = messages[0]?.createdAt;
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** Prepend older rows, deduping by `id`. Returns `null` when nothing new would be added. */
export function prependUniqueById<T extends { id: string }>(
	existing: readonly T[],
	older: readonly T[]
): T[] | null {
	if (older.length === 0) return null;
	const seen = new Set(existing.map((item) => item.id));
	const uniqueOlder = older.filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
	if (uniqueOlder.length === 0) return null;
	return [...uniqueOlder, ...existing];
}

export type ThreadHistoryControls = {
	readonly hasOlder: boolean;
	readonly isLoadingOlder: boolean;
	readonly loadError: string | null;
	loadOlder(): Promise<void>;
};
