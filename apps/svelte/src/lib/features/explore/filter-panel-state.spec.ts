import { describe, expect, it } from 'vitest';
import { isFilterPanelOpenFromCookie } from './filter-panel-state';

// Cookie codec round-trip. Must agree byte-for-byte with what `writeFilterPanelCookie` writes
// (`explore_filters_state=true|false`).
describe('explore_filters_state cookie codec', () => {
	it('is closed when the cookie is absent (default)', () => {
		expect(isFilterPanelOpenFromCookie(undefined)).toBe(false);
	});

	it('is open ONLY for the literal "true"', () => {
		expect(isFilterPanelOpenFromCookie('true')).toBe(true);
	});

	it('is closed for the literal "false"', () => {
		expect(isFilterPanelOpenFromCookie('false')).toBe(false);
	});

	it('treats any other value as closed', () => {
		expect(isFilterPanelOpenFromCookie('')).toBe(false);
		expect(isFilterPanelOpenFromCookie('1')).toBe(false);
		expect(isFilterPanelOpenFromCookie('True')).toBe(false);
	});
});
