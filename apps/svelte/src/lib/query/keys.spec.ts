import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys';

// Query key registry — test mengunci bentuk key (deteksi drift).
describe('queryKeys registry', () => {
	it('workspaces', () => {
		expect(queryKeys.workspaces.all).toEqual(['workspaces']);
		expect(queryKeys.workspaces.list({ includeArchived: true })).toEqual([
			'workspaces',
			'list',
			{ includeArchived: true }
		]);
		expect(queryKeys.workspaces.detail('w1')).toEqual(['workspaces', 'detail', 'w1']);
	});

	it('threads (termasuk default sendStatus)', () => {
		expect(queryKeys.threads.list()).toEqual(['threads', 'list']);
		expect(queryKeys.threads.pinned()).toEqual(['threads', 'pinned']);
		expect(queryKeys.threads.messages('t1')).toEqual(['threads', 'messages', 't1']);
		expect(queryKeys.threads.sendStatus()).toEqual(['threads', 'send-status', 'normal_chat']);
		expect(queryKeys.threads.sendStatus('deep_research')).toEqual([
			'threads',
			'send-status',
			'deep_research'
		]);
	});

	it('citations (perpustakaan akun + params)', () => {
		expect(queryKeys.citations.list({ q: 'x', status: null, source: null, tag: null })).toEqual([
			'citations',
			'list',
			{ q: 'x', status: null, source: null, tag: null }
		]);
		expect(queryKeys.citations.links('w1')).toEqual(['citations', 'links', 'w1']);
		expect(queryKeys.citations.render('w1', { styleId: 'apa', ids: ['a', 'b'] })).toEqual([
			'citations',
			'render',
			'w1',
			{ styleId: 'apa', ids: ['a', 'b'] }
		]);
	});

	it('artifacts.list membedakan folderId null', () => {
		expect(queryKeys.artifacts.list('w1', null)).toEqual(['artifacts', 'list', 'w1', null]);
		expect(queryKeys.artifacts.list('w1', 'f1')).toEqual(['artifacts', 'list', 'w1', 'f1']);
	});

	it('deterministik: input sama → key deep-equal (codec stabil)', () => {
		expect(queryKeys.feed.list({ mode: 'for-you', topic: null })).toEqual(
			queryKeys.feed.list({ mode: 'for-you', topic: null })
		);
	});
});
