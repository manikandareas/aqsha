import { describe, expect, it } from 'vitest';
import { deepRunsQuota, isCreditsLow, LOW_CREDIT_RATIO } from './billing-derived';
import { formatCount, formatCredits, formatIdr } from './format';
import { settingsItemForPath, settingsMenu } from './settings-menu';
import { PROVIDER_AUTH_MODE, PROVIDER_META } from './integrations';

describe('billing-derived — isCreditsLow', () => {
	it(`flags low at ≤${LOW_CREDIT_RATIO * 100}% remaining`, () => {
		expect(
			isCreditsLow({ isUnlimitedCredits: false, creditsLimit: 100, creditsRemaining: 15 })
		).toBe(true);
		expect(
			isCreditsLow({ isUnlimitedCredits: false, creditsLimit: 100, creditsRemaining: 16 })
		).toBe(false);
	});

	it('never low for unlimited or zero-quota', () => {
		expect(isCreditsLow({ isUnlimitedCredits: true, creditsLimit: 100, creditsRemaining: 0 })).toBe(
			false
		);
		expect(isCreditsLow({ isUnlimitedCredits: false, creditsLimit: 0, creditsRemaining: 0 })).toBe(
			false
		);
	});
});

describe('billing-derived — deepRunsQuota', () => {
	it('recognises the MAX_SAFE_INTEGER unlimited sentinel', () => {
		const q = deepRunsQuota({ deepRunsUsed: 3, deepRunsLimit: Number.MAX_SAFE_INTEGER });
		expect(q.unlimited).toBe(true);
		expect(q.remaining).toBe(Number.POSITIVE_INFINITY);
	});

	it('clamps remaining ≥ 0', () => {
		expect(deepRunsQuota({ deepRunsUsed: 5, deepRunsLimit: 3 })).toEqual({
			unlimited: false,
			remaining: 0
		});
		expect(deepRunsQuota({ deepRunsUsed: 1, deepRunsLimit: 3 })).toEqual({
			unlimited: false,
			remaining: 2
		});
	});
});

describe('settings format', () => {
	it('formatIdr → "Gratis" for 0, Rp-prefixed grouped otherwise (no NBSP)', () => {
		expect(formatIdr(0)).toBe('Gratis');
		expect(formatIdr(49_000)).toBe('Rp49.000');
	});

	it('formatCredits → ∞ when unlimited, grouped otherwise', () => {
		expect(formatCredits(150, true)).toBe('∞');
		expect(formatCredits(1_500, false)).toBe('1.500');
	});

	it('formatCount groups id-ID', () => {
		expect(formatCount(10_000)).toBe('10.000');
	});
});

describe('settings-menu', () => {
	it('has all seven sections in Pribadi/Riset groups', () => {
		expect(settingsMenu.map((i) => i.key)).toEqual([
			'overview',
			'account',
			'appearance',
			'personalization',
			'usage-billing',
			'security',
			'integrations'
		]);
	});

	it('settingsItemForPath matches exact + nested, falls back to overview', () => {
		expect(settingsItemForPath('/app/settings/account').key).toBe('account');
		expect(settingsItemForPath('/app/settings/security/anything').key).toBe('security');
		expect(settingsItemForPath('/app/settings').key).toBe('overview');
		expect(settingsItemForPath('/somewhere/else').key).toBe('overview');
	});
});

describe('integrations meta', () => {
	it('Mendeley = oauth, Zotero = api_key', () => {
		expect(PROVIDER_AUTH_MODE.mendeley).toBe('oauth');
		expect(PROVIDER_AUTH_MODE.zotero).toBe('api_key');
		expect(PROVIDER_META.mendeley.label).toBe('Mendeley');
		expect(PROVIDER_META.zotero.helpUrl).toContain('zotero.org');
	});
});
