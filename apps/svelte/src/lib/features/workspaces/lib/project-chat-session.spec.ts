import { describe, expect, it } from 'vitest';
import { ProjectChatSession } from './project-chat-session.svelte';

describe('ProjectChatSession', () => {
	it('promotes a draft to accepted without replacing identity or enabling secondary queries', () => {
		const session = new ProjectChatSession(null, () => 'draft-1');
		const before = session.threadId;
		const revision = session.runtimeRevision;

		expect(session.phase).toEqual({ kind: 'draft', threadId: 'draft-1' });
		expect(session.promote(before)).toBe(true);
		expect(session.phase).toEqual({ kind: 'accepted', threadId: 'draft-1' });
		expect(session.activeThreadId).toBe('draft-1');
		expect(session.threadId).toBe(before);
		expect(session.restoreThreadId).toBeNull();
		expect(session.runtimeRevision).toBe(revision);
		expect(session.threadPersisted).toBe(false);
		expect(session.canRunAgent).toBe(true);

		expect(session.markReady()).toBe(true);
		expect(session.phase).toEqual({ kind: 'ready', threadId: 'draft-1' });
		expect(session.threadPersisted).toBe(true);
	});

	it('does not mark ready when settle happens on a failed draft', () => {
		const session = new ProjectChatSession(null, () => 'draft-1');

		expect(session.markReady()).toBe(false);
		expect(session.phase.kind).toBe('draft');
		expect(session.activeThreadId).toBeNull();
		expect(session.threadPersisted).toBe(false);
	});

	it('ignores a late promote from a thread that is no longer active', () => {
		const session = new ProjectChatSession(null, () => 'draft-1');
		session.select('thread-2');

		expect(session.phase).toEqual({ kind: 'restoring', threadId: 'thread-2' });
		expect(session.promote('draft-1')).toBe(false);
		expect(session.activeThreadId).toBe('thread-2');
		expect(session.restoreThreadId).toBe('thread-2');
		expect(session.threadPersisted).toBe(false);
		expect(session.runtimeRevision).toBe(1);
		expect(session.canRunAgent).toBe(false);
	});

	it('advances restore to ready or failed without bumping agent revision', () => {
		const session = new ProjectChatSession('thread-1', () => 'draft-x');
		const revision = session.runtimeRevision;

		expect(session.phase.kind).toBe('restoring');
		expect(session.markRestored()).toBe(true);
		expect(session.phase).toEqual({ kind: 'ready', threadId: 'thread-1' });
		expect(session.runtimeRevision).toBe(revision);
		expect(session.threadPersisted).toBe(true);

		session.select('thread-2');
		expect(session.markRestoreFailed()).toBe(true);
		expect(session.phase.kind).toBe('restore_failed');
		expect(session.retryRestore()).toBe(true);
		expect(session.phase.kind).toBe('restoring');
	});

	it('creates a fresh draft only when the user explicitly starts a new chat', () => {
		let sequence = 0;
		const session = new ProjectChatSession('thread-1', () => `draft-${++sequence}`);

		session.markRestored();
		expect(session.threadPersisted).toBe(true);

		session.startNew();

		expect(session.phase).toEqual({ kind: 'draft', threadId: 'draft-1' });
		expect(session.activeThreadId).toBeNull();
		expect(session.restoreThreadId).toBeNull();
		expect(session.threadPersisted).toBe(false);
		expect(session.runtimeRevision).toBe(1);
	});
});
