import {
	buildPaperMentionLabel,
	type ContextRef,
	contextRefKey,
	contextRefsSignature,
	MAX_CONTEXT_PAPERS
} from '@aqsha/chat-core';
import { createContext } from '$lib/context';

/**
 * Composer mention channels (Svelte port of `apps/web/features/thread-experience/components/
 * composer-context-mentions.tsx`). Three independent epoch-driven channels the composer consumes and
 * explore/workspace pages (Phase 8/9) publish to:
 *
 *  - **ambient**: page-level context (workspace/artifact/paper/news) auto-injected as a composer pill;
 *    replace-on-nav. `ambientEpoch` bumps on every set (incl. same value) so re-clicking "Tanya Astra"
 *    on the same item re-injects a removed pill (signature-only would look like a dead button).
 *  - **selection**: library "click-once = context" multi-toggle, curated by the user, synced two-way
 *    with the composer pill (removing a pill deselects the card).
 *  - **draft**: imperative composer-text prefill (e.g. a stats next-step chip) — overwrites text via an
 *    epoch merge, never auto-sends.
 *
 * A runes state class held per-tree via `createContext` (§3.5 — never a module singleton, so nothing
 * leaks across users under SSR). Instantiate once in the product providers; publishers (Phase 8/9)
 * mutate it; the composer merges by epoch. Safe with no publishers: every channel starts empty.
 */
export class ComposerMentions {
	// ── ambient ──────────────────────────────────────────────────────────────────────────────────
	#ambientRefs = $state<ContextRef[]>([]);
	#ambientEpoch = $state(0);
	#ambientPropSignature = '';

	get ambientContextRefs(): ContextRef[] {
		return this.#ambientRefs;
	}
	get ambientEpoch(): number {
		return this.#ambientEpoch;
	}

	/** Imperative override (feed card "Tanya Astra" → swap the ambient token). */
	setAmbientContextRefs(refs: ContextRef[]): void {
		this.#ambientRefs = refs;
		this.#ambientEpoch += 1;
	}

	/**
	 * Sync ambient refs from the active page (reader/artifact data arriving). Guarded by signature so a
	 * page re-render with the same refs is a no-op; a genuine change bumps the epoch (mirror the web
	 * "adjust state during render" guard). Called from the surface when its page context changes.
	 */
	syncAmbientFromPage(refs: ContextRef[]): void {
		const signature = contextRefsSignature(refs);
		if (signature === this.#ambientPropSignature) return;
		this.#ambientPropSignature = signature;
		this.#ambientRefs = refs;
		this.#ambientEpoch += 1;
	}

	// ── selection ────────────────────────────────────────────────────────────────────────────────
	#selectionRefs = $state<ContextRef[]>([]);
	#selectionEpoch = $state(0);

	get selectionRefs(): ContextRef[] {
		return this.#selectionRefs;
	}
	get selectionEpoch(): number {
		return this.#selectionEpoch;
	}

	addSelectionRef(ref: ContextRef): void {
		if (this.#selectionRefs.some((existing) => contextRefKey(existing) === contextRefKey(ref)))
			return;
		this.#selectionRefs = [...this.#selectionRefs, ref];
		this.#selectionEpoch += 1;
	}

	removeSelectionArtifact(artifactId: string): void {
		const next = this.#selectionRefs.filter(
			(ref) => !(ref.kind === 'paper' && ref.artifactId === artifactId)
		);
		if (next.length === this.#selectionRefs.length) return; // no-op keeps back-prop stable
		this.#selectionRefs = next;
		this.#selectionEpoch += 1;
	}

	replaceSelectionRefs(refs: ContextRef[]): void {
		this.#selectionRefs = refs;
		this.#selectionEpoch += 1;
	}

	clearSelectionRefs(): void {
		if (this.#selectionRefs.length === 0) return;
		this.#selectionRefs = [];
		this.#selectionEpoch += 1;
	}

	// ── draft (text prefill) ───────────────────────────────────────────────────────────────────────
	#draftContent = $state('');
	#draftEpoch = $state(0);

	get draftContent(): string {
		return this.#draftContent;
	}
	get draftEpoch(): number {
		return this.#draftEpoch;
	}

	setComposerDraft(text: string): void {
		this.#draftContent = text;
		this.#draftEpoch += 1;
	}
}

const composerMentionsContext = createContext<ComposerMentions>('composer-mentions');

export const setComposerMentions = (value: ComposerMentions): ComposerMentions =>
	composerMentionsContext.set(value);

/** Read the mention channels. Returns a fresh empty instance when no provider exists (safe default). */
export function getComposerMentions(): ComposerMentions {
	return composerMentionsContext.getOptional() ?? new ComposerMentions();
}

/**
 * Adapter for the library board/grid ("click-once = context") — builds a `paper` ref from an
 * artifactId and syncs card highlight with the selection channel (the same one the composer pins).
 * Ported from web `usePanelContextSelection`; consumed by Phase 9 workspace grids.
 */
export function panelContextSelection(
	mentions: ComposerMentions,
	args: { workspaceId: string; workspaceName: string; titleById: () => Map<string, string> }
) {
	const selectedIds = () =>
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient lookup set, not reactive state
		new Set(
			mentions.selectionRefs.flatMap((ref) => (ref.kind === 'paper' ? [ref.artifactId] : []))
		);
	const buildRef = (artifactId: string): ContextRef => ({
		kind: 'paper',
		workspaceId: args.workspaceId,
		artifactId,
		label: buildPaperMentionLabel(args.workspaceName, args.titleById().get(artifactId) ?? 'Paper')
	});
	return {
		get contextCount(): number {
			return selectedIds().size;
		},
		getArtifactSelected: (artifactId: string) => selectedIds().has(artifactId),
		onToggleArtifactContext: (artifactId: string) => {
			const ids = selectedIds();
			if (ids.has(artifactId)) mentions.removeSelectionArtifact(artifactId);
			// Cap the library selection to the same paper budget as the @-mention palette gate.
			else if (ids.size < MAX_CONTEXT_PAPERS) mentions.addSelectionRef(buildRef(artifactId));
		},
		onSetArtifactContextSelection: (artifactIds: string[]) => {
			mentions.replaceSelectionRefs(artifactIds.slice(0, MAX_CONTEXT_PAPERS).map(buildRef));
		}
	};
}
