import { describe, expect, it } from 'vitest';
import { isSidebarOpenFromCookie } from './sidebar-state';

// Cookie codec round-trip (§10 Phase 3 gate). Must agree byte-for-byte with what
// `Sidebar.Provider` writes (`sidebar_state=true|false`) and with web's read semantics.
describe('sidebar_state cookie codec', () => {
	it('is open when the cookie is absent (default)', () => {
		expect(isSidebarOpenFromCookie(undefined)).toBe(true);
	});

	it('is open for the literal "true"', () => {
		expect(isSidebarOpenFromCookie('true')).toBe(true);
	});

	it('is collapsed ONLY for the literal "false"', () => {
		expect(isSidebarOpenFromCookie('false')).toBe(false);
	});

	it('treats any non-"false" value as open (matches web !== "false")', () => {
		expect(isSidebarOpenFromCookie('')).toBe(true);
		expect(isSidebarOpenFromCookie('1')).toBe(true);
		expect(isSidebarOpenFromCookie('False')).toBe(true);
	});
});
