// Local thread/message/artifact types for the thread feature (structural — matches the shape Eden
// infers from the API). Intentionally does NOT import `@aqsha/db` so drizzle never reaches the
// client bundle.
//
// `Artifact` / `FileChipData` re-declared here for the attachment-buckets model. The full artifact
// type lives in `features/artifacts`; this structural subset keeps the thread engine self-contained.

export type ChatThread = {
	id: string;
	ownerUserId: string;
	title: string | null;
	titleStatus: string | null; // "generating" | "ready" | null
	status: string; // "idle" | "streaming" | "failed"
	agentKind: string; // "lite" | "pro"
	workspaceId?: string | null;
	lastMessagePreview: string | null;
	lastActivityAt: number;
	pinnedAt: number | null; // null = not pinned; value ⇒ pinned (sort key for the "Pinned" group)
	createdAt: number;
	updatedAt: number;
};

/** Research source persisted by Astra tools (Slice 6.4) — Sources panel. */
export type ResearchSource = {
	id: string;
	threadId: string;
	turnId: string;
	citationNumber: number | null;
	origin: string; // "web" | "arxiv" | "doi"
	provider: string | null;
	title: string;
	locator: string;
	url: string | null;
	doi: string | null;
	arxivId: string | null;
	snippet: string;
	evidenceStrength: string; // "strong" | "medium" | "weak"
	discoveryQuery: string | null;
	/** `/deep` sub-question index that found the source (null in normal chat) — card grouping. */
	subQuestionIndex: number | null;
	subQuestionText: string | null;
	/** OG image (best-effort) for the source card (null when absent). */
	imageUrl: string | null;
	createdAt: number;
};

/** Compact row for switchers / landing "recent" lists (pinned + activity-sorted). */
export type RecentThreadSummary = {
	threadId: string;
	title: string;
	lastActivityAt: number;
};

/** Displayed thread title (fallback when none yet / auto-title has not run). */
export const threadTitle = (t: Pick<ChatThread, 'title'>): string =>
	t.title?.trim() ? t.title : 'Percakapan baru';

/** Browser-tab / chrome title for a loaded thread detail (or the threads section while loading). */
export const threadPageTitle = (t: Pick<ChatThread, 'title'> | null | undefined): string =>
	t ? threadTitle(t) : 'Threads';

/** Read-only file attachment mapped onto a user message (rendered as a FileChip). */
export type FileChipData = {
	id: string;
	title: string;
	mimeType?: string | null;
	/** `pending` (async indexing) → spinner icon on the icon block. */
	indexingStatus?: string | null;
};

/** Structural subset of the artifact row used by the thread engine (attachments, cards). */
export type Artifact = {
	_id: string;
	workspaceId: string | null;
	folderId: string | null;
	artifactType: string;
	artifactFamily: string;
	source: string;
	title: string;
	language: string | null;
	mimeType: string | null;
	fileName: string | null;
	byteSize: number | null;
	indexingStatus: string;
	indexingFailureReason: string | null;
	detectedDocumentKind: string | null;
	plainTextPreview: string | null;
	status: string | null;
	createdAt: number;
	updatedAt: number;
};
