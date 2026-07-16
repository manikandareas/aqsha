import { describe, expect, test } from 'vitest';
import { mergeRecentThreadSummaries } from './recent-thread-summaries';
import type { ChatThread } from '../types';

function thread(partial: Partial<ChatThread> & Pick<ChatThread, 'id'>): ChatThread {
	return {
		ownerUserId: 'u',
		title: null,
		titleStatus: null,
		status: 'idle',
		agentKind: 'lite',
		lastMessagePreview: null,
		lastActivityAt: 0,
		pinnedAt: null,
		createdAt: 0,
		updatedAt: 0,
		...partial
	};
}

describe('mergeRecentThreadSummaries', () => {
	test('pins first, then list pages, dedups by id', () => {
		const pinned = [
			thread({ id: 'a', title: 'Pinned', lastActivityAt: 1, pinnedAt: 10 }),
			thread({ id: 'b', title: 'Also pinned', lastActivityAt: 2, pinnedAt: 9 })
		];
		const pages = [
			{
				items: [
					thread({ id: 'a', title: 'Pinned race', lastActivityAt: 99 }),
					thread({ id: 'c', title: 'Recent', lastActivityAt: 3 })
				]
			}
		];

		expect(mergeRecentThreadSummaries(pinned, pages)).toEqual([
			{ threadId: 'a', title: 'Pinned', lastActivityAt: 1 },
			{ threadId: 'b', title: 'Also pinned', lastActivityAt: 2 },
			{ threadId: 'c', title: 'Recent', lastActivityAt: 3 }
		]);
	});

	test('falls back title via threadTitle', () => {
		expect(mergeRecentThreadSummaries([thread({ id: 'x', title: '  ' })], undefined)).toEqual([
			{ threadId: 'x', title: 'Percakapan baru', lastActivityAt: 0 }
		]);
	});
});
