// Shared option types for the composer palettes and the tokenized editor.

export type ContextWorkspaceOption = {
	workspaceId: string;
	name: string;
	emoji?: string;
};

export type ContextItemOption = {
	workspaceId: string;
	artifactId: string;
	title: string;
};

export type MentionWorkspaceOption = {
	type: 'workspace';
	workspaceId: string;
	name: string;
	emoji?: string;
	isAmbient?: boolean;
	/** Disabled because it is already pinned or the workspace cap is reached. */
	disabled?: boolean;
	disabledReason?: string;
};

export type MentionItemOption = {
	type: 'item';
	workspaceId: string;
	workspaceName: string;
	artifactId: string;
	title: string;
	/** Disabled because it is already pinned or the paper cap is reached. */
	disabled?: boolean;
	disabledReason?: string;
};

/**
 * Composer placeholder. `string` = used as-is at every width; `{ narrow, wide }` = per-CONTAINER
 * variants (not viewport) — `wide` shows when the composer is ≥ `@lg` (full thread column), `narrow`
 * in a cramped chat panel. Chosen via container query.
 */
export type ComposerPlaceholder = string | { narrow: string; wide: string };
