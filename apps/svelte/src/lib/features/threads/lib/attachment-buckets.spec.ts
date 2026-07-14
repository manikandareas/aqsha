import { describe, expect, it } from 'vitest';
import { bucketMessageAttachments } from './attachment-buckets';
import type { Artifact } from '../types';
import type { TimelineMessage } from './timeline-types';

// Contract tests for the attachment bucketing model (THC-8): explicit (live) vs time-window (rehydrate).

const upload = (id: string, createdAt: number, extra: Partial<Artifact> = {}): Artifact =>
	({
		_id: id,
		workspaceId: null,
		folderId: null,
		artifactType: 'pdf',
		artifactFamily: 'file',
		source: 'upload',
		title: id,
		language: null,
		mimeType: 'application/pdf',
		fileName: `${id}.pdf`,
		byteSize: 1,
		indexingStatus: 'ready',
		indexingFailureReason: null,
		detectedDocumentKind: null,
		plainTextPreview: null,
		status: 'ready',
		createdAt,
		updatedAt: createdAt,
		...extra
	}) as Artifact;

const userMsg = (id: string, createdAt: number, attachmentIds?: string[]): TimelineMessage => ({
	id,
	role: 'user',
	streaming: false,
	createdAt,
	...(attachmentIds ? { attachmentIds } : {}),
	parts: []
});

describe('bucketMessageAttachments', () => {
	it('returns an empty map when there are no artifacts', () => {
		expect(bucketMessageAttachments([userMsg('u', 1)], undefined).size).toBe(0);
	});

	it('explicit path: maps attachmentIds directly (exact, no time guessing)', () => {
		const map = bucketMessageAttachments([userMsg('u1', 100, ['a1'])], [upload('a1', 999)]);
		expect(map.get('u1')?.map((a) => a.id)).toEqual(['a1']);
	});

	it('time-window path: attaches an upload to the user message just after it finalized', () => {
		const messages = [userMsg('u1', 100), userMsg('u2', 300)];
		const map = bucketMessageAttachments(messages, [upload('a1', 200)]);
		// upload at 200 is > prevUser(100) and <= u2(300) → belongs to u2, not u1.
		expect(map.has('u1')).toBe(false);
		expect(map.get('u2')?.map((a) => a.id)).toEqual(['a1']);
	});

	it('ignores deleted uploads and non-upload sources', () => {
		const arts = [upload('a1', 200, { status: 'deleted' }), upload('a2', 200, { source: 'agent' })];
		const map = bucketMessageAttachments([userMsg('u2', 300)], arts);
		expect(map.size).toBe(0);
	});
});
