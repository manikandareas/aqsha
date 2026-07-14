import type { Artifact, FileChipData } from '../types';
import type { TimelineMessage } from './timeline-types';

/** Upload attachment mapped onto a single user message (rendered as a read-only FileChip). */
export type MessageAttachment = FileChipData;

function toAttachment(a: Artifact): MessageAttachment {
	return { id: a._id, title: a.title, mimeType: a.mimeType, indexingStatus: a.indexingStatus };
}

/**
 * Map thread upload attachments → user messages. Mastra does not link an artifact to a specific
 * message (see adapter note), so the link is built read-side via TWO paths:
 *
 * 1. **Explicit (live, exact).** An optimistic message of this session carries `attachmentIds` (the ids
 *    the user sent) → mapped directly from id, WITHOUT time guessing. This removes the fragility of
 *    client-vs-server clock skew on the live view.
 * 2. **Time window (rehydrate — HEURISTIC).** A rehydrated message has no `attachmentIds`; each upload
 *    is attached to the user message created just after it was finalized. Lower bound = the PREVIOUS
 *    USER message (NOT an assistant message in between), so a file staged while the assistant replies
 *    still attaches to the next user message. Server timestamps → stable across refresh, BUT still a
 *    guess: an orphan upload / out-of-order finalize / staged-but-unsent file may attach to the next
 *    user message. A persistent artifact↔message link would remove this guess (blocked by Mastra owning
 *    the chat message ids).
 *
 * Attachments removed before sending are already soft-deleted (absent from the list) → unmapped.
 * Verbatim port of `apps/web/features/threads/lib/attachment-buckets.ts`.
 */
export function bucketMessageAttachments(
	messages: readonly TimelineMessage[],
	artifacts: readonly Artifact[] | undefined
): Map<string, MessageAttachment[]> {
	const map = new Map<string, MessageAttachment[]>();
	if (!artifacts || artifacts.length === 0) return map;

	// Active uploads in time order — the basis for the time-window (rehydrate) path.
	const uploads = artifacts
		.filter((a) => a.source === 'upload' && a.status !== 'deleted' && a.createdAt > 0)
		.sort((x, y) => x.createdAt - y.createdAt);

	// `byId` (for the explicit path) is built LAZILY — only when a message carries `attachmentIds`. On
	// rehydrate (the common case) there is none, so this map is never built in vain.
	let byId: Map<string, Artifact> | null = null;
	const lookupById = (): Map<string, Artifact> => {
		if (!byId) {
			byId = new Map(artifacts.filter((a) => a.status !== 'deleted').map((a) => [a._id, a]));
		}
		return byId;
	};

	// Lower bound of each user message = the PREVIOUS USER message's createdAt (first message = 0).
	// Assistant messages do NOT move the bound → an attachment staged while the assistant replies still
	// belongs to the next user message. A message without a readable timestamp (upper 0) does not move
	// the bound (can't be windowed).
	let prevUserAt = 0;
	for (const m of messages) {
		if (m.role !== 'user') continue;

		// Explicit path: a live message carries attachment ids → map directly (exact).
		if (m.attachmentIds && m.attachmentIds.length > 0) {
			const lookup = lookupById();
			const owned = m.attachmentIds
				.map((id) => lookup.get(id))
				.filter((a): a is Artifact => Boolean(a))
				.map(toAttachment);
			if (owned.length > 0) map.set(m.id, owned);
			if (m.createdAt) prevUserAt = m.createdAt;
			continue;
		}

		const upper = m.createdAt || 0;
		if (!upper) continue;
		const lower = prevUserAt;
		prevUserAt = upper;
		if (uploads.length === 0) continue;
		const owned = uploads.filter((u) => u.createdAt > lower && u.createdAt <= upper);
		if (owned.length > 0) map.set(m.id, owned.map(toAttachment));
	}
	return map;
}
