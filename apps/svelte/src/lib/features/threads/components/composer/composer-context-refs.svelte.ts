import { untrack } from 'svelte';
import { contextRefKey, type ContextRef } from '@aqsha/chat-core';
import type { ComposerMentions } from '../../state/composer-mentions.svelte';

/** Drop `removeKeys`, then prepend `addRefs` not already present (dedup by key). */
export function reconcilePinnedRefs(
	current: ContextRef[],
	removeKeys: Set<string>,
	addRefs: ContextRef[]
): ContextRef[] {
	const kept = current.filter((ref) => !removeKeys.has(contextRefKey(ref)));
	const keptKeys = new Set(kept.map(contextRefKey));
	const toAdd = addRefs.filter((ref) => !keptKeys.has(contextRefKey(ref)));
	return [...toAdd, ...kept];
}

/**
 * Epoch-driven merges for ambient page context and library selection pills into `contextRefs`.
 * Each channel bump drops that channel's stale pills and prepends the current set; manual pills stay.
 */
export function useComposerContextRefEpochMerges(
	mentions: ComposerMentions,
	getContextRefs: () => ContextRef[],
	setContextRefs: (refs: ContextRef[]) => void
): void {
	let ambientMerge = { epoch: -1, refs: [] as ContextRef[] };
	$effect(() => {
		const epoch = mentions.ambientEpoch;
		if (epoch === ambientMerge.epoch) return;
		const ambientRefs = mentions.ambientContextRefs;
		const ambientKeys = new Set([...ambientMerge.refs, ...ambientRefs].map(contextRefKey));
		ambientMerge = { epoch, refs: ambientRefs };
		setContextRefs(
			reconcilePinnedRefs(untrack(getContextRefs), ambientKeys, ambientRefs)
		);
	});

	let selectionMerge = { epoch: -1, keys: [] as string[] };
	$effect(() => {
		const epoch = mentions.selectionEpoch;
		if (epoch === selectionMerge.epoch) return;
		const selectionRefs = mentions.selectionRefs;
		const nextKeys = selectionRefs.map(contextRefKey);
		const nextKeySet = new Set(nextKeys);
		const removedKeys = new Set(selectionMerge.keys.filter((k) => !nextKeySet.has(k)));
		selectionMerge = { epoch, keys: nextKeys };
		setContextRefs(
			reconcilePinnedRefs(untrack(getContextRefs), removedKeys, selectionRefs)
		);
	});
}
