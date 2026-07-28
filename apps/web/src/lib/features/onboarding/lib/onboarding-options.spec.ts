import { describe, expect, it } from 'vitest';
import {
	BACKGROUND_IDS,
	MIN_INTERESTS as SERVICE_MIN_INTERESTS,
	SOURCE_IDS,
	SOURCE_OTHER_ID
} from '../../../../../../../packages/services/src/onboarding/options';
import { INTEREST_FIELD_TOPICS } from '../../../../../../../packages/services/src/feed/interestKeywords';
import {
	BACKGROUND_OPTIONS,
	INTEREST_OPTIONS,
	MIN_INTERESTS,
	SOURCE_OPTIONS,
	SOURCE_OTHER
} from './onboarding-options';

// Contract guard vs packages/services without pulling @aqsha/services into the app
// runtime graph — import the leaf option modules directly in this test only.

describe('onboarding options contract vs @aqsha/services', () => {
	it('BACKGROUND_OPTIONS ids match BACKGROUND_IDS', () => {
		expect(BACKGROUND_OPTIONS.map((o) => o.id)).toEqual([...BACKGROUND_IDS]);
	});

	it('SOURCE_OPTIONS + SOURCE_OTHER match SOURCE_IDS', () => {
		expect([...SOURCE_OPTIONS.map((o) => o.id), SOURCE_OTHER.id]).toEqual([...SOURCE_IDS]);
		expect(SOURCE_OTHER.id).toBe(SOURCE_OTHER_ID);
	});

	it('INTEREST_OPTIONS ids match INTEREST_FIELD_TOPICS keys', () => {
		expect(INTEREST_OPTIONS.map((o) => o.id)).toEqual(Object.keys(INTEREST_FIELD_TOPICS));
	});

	it('MIN_INTERESTS matches the service gate', () => {
		expect(MIN_INTERESTS).toBe(SERVICE_MIN_INTERESTS);
	});
});
