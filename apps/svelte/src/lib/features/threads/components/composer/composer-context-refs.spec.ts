import { describe, expect, it } from 'vitest';
import type { ContextRef } from '@aqsha/chat-core';
import { reconcilePinnedRefs } from './composer-context-refs.svelte';
import { projectPageAmbientRefs } from '../../state/composer-mentions.svelte';

const workspace = (workspaceId: string, label = workspaceId): ContextRef => ({
	kind: 'workspace',
	workspaceId,
	label
});

const paper = (workspaceId: string, artifactId: string, label = artifactId): ContextRef => ({
	kind: 'paper',
	workspaceId,
	artifactId,
	label
});

describe('reconcilePinnedRefs', () => {
	it('project page has no automatic workspace pill because thread scope is server-side', () => {
		expect(projectPageAmbientRefs()).toEqual([]);
	});

	it('removes keys then prepends new refs that are not already kept', () => {
		const current = [workspace('a'), workspace('b'), paper('a', 'p1')];
		const next = reconcilePinnedRefs(
			current,
			new Set(['a:', 'a:p1']),
			[workspace('c'), workspace('b')]
		);
		expect(next).toEqual([workspace('c'), workspace('b')]);
	});

	it('dedupes addRefs against kept keys and preserves kept order after prepend', () => {
		const current = [workspace('keep'), paper('w', 'p1')];
		const next = reconcilePinnedRefs(current, new Set(), [
			workspace('keep'),
			workspace('new'),
			paper('w', 'p1')
		]);
		expect(next).toEqual([workspace('new'), workspace('keep'), paper('w', 'p1')]);
	});

	it('can clear a channel while leaving unrelated manual refs', () => {
		const current = [workspace('ambient'), workspace('manual'), paper('w', 'sel')];
		const next = reconcilePinnedRefs(current, new Set(['ambient:', 'w:sel']), []);
		expect(next).toEqual([workspace('manual')]);
	});
});
