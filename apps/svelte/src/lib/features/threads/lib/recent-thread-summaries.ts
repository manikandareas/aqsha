import { threadTitle, type ChatThread, type RecentThreadSummary } from '../types';

/**
 * Pinned first, then the infinite list — dedup by id (pinned rows are excluded from the list
 * query, but a race can still surface the same id in both).
 */
export function mergeRecentThreadSummaries(
	pinned: ChatThread[] | undefined,
	pages: { items: ChatThread[] }[] | undefined
): RecentThreadSummary[] {
	const merged = [...(pinned ?? []), ...(pages ?? []).flatMap((p) => p.items)];
	const seen = new Set<string>();
	const out: RecentThreadSummary[] = [];
	for (const t of merged) {
		if (seen.has(t.id)) continue;
		seen.add(t.id);
		out.push({ threadId: t.id, title: threadTitle(t), lastActivityAt: t.lastActivityAt });
	}
	return out;
}
