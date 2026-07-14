import type { ComposerAgentKind } from './agent-selection.svelte';

/** Send-block notice (Slice 6.2) — billing return-union / cooldown rate-limit. */
export type ComposerNotice = {
	message: string;
	/** Epoch-ms; when present → show a "(N detik)" countdown until sending is allowed again. */
	retryAt?: number;
};

/**
 * Send payload (Slice 6.6). `text` = the prompt the agent receives (commands already expanded
 * client-side). `clientContext` = ephemeral context (command expansion + `@mention` notes) NOT
 * persisted. `richText` = the `text` variant carrying `@mention` markers (U+E000/E001) to DISPLAY +
 * PERSIST as pills (present only when the message has a mention; the agent gets clean `text`).
 * `command:"deep"` → run the deep-research Workflow (not a chat turn); `text` = the research question.
 * `attachmentIds` map EXACTLY onto the live user bubble (no time-window guessing).
 */
export type ComposerSendPayload = {
	text: string;
	richText?: string;
	clientContext?: string[];
	agentKind: ComposerAgentKind;
	command?: 'deep';
	attachmentIds?: string[];
};

/** Compact thread for the "Recent threads" start panel (landing). */
export type RecentThread = {
	threadId: string;
	title: string;
	lastActivityAt: number;
};

/** Finalized composer attachment on the thread (Slice 6.7). `indexingStatus` tracks async index (D5). */
export type ComposerAttachment = {
	artifactId: string;
	title: string;
	indexingStatus?: string;
};
