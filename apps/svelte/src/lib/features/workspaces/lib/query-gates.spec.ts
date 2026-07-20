import { describe, expect, it } from 'vitest';
import { isClerkSignedInQueryEnabled, isWorkspaceDetailQueryEnabled } from './query-gates';

describe('workspace query gates', () => {
	it('requires a loaded Clerk session with a user id', () => {
		expect(isClerkSignedInQueryEnabled(false, 'user_1')).toBe(false);
		expect(isClerkSignedInQueryEnabled(true, null)).toBe(false);
		expect(isClerkSignedInQueryEnabled(true, 'user_1')).toBe(true);
	});

	it('requires a signed-in session and a concrete workspace id for artifact detail', () => {
		expect(isWorkspaceDetailQueryEnabled(false, 'ws_1')).toBe(false);
		expect(isWorkspaceDetailQueryEnabled(true, '')).toBe(false);
		expect(isWorkspaceDetailQueryEnabled(true, 'ws_1')).toBe(true);
	});
});
