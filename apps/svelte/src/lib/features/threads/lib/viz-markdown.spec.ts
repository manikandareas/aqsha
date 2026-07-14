import { describe, expect, it } from 'vitest';
import { isVizFence, VIZ_LANGUAGE, vizPayloadFromCode } from './viz-markdown';

// Contract tests for the deep-viz fence transform (THC-4). The render path is a marked block extension
// in the Streamdown adapter; the fence/payload extraction is pinned here.

describe('isVizFence', () => {
	it('matches the aqsha:viz info string (trim-tolerant)', () => {
		expect(isVizFence(VIZ_LANGUAGE)).toBe(true);
		expect(isVizFence('  aqsha:viz  ')).toBe(true);
	});
	it('rejects other languages', () => {
		expect(isVizFence('python')).toBe(false);
		expect(isVizFence(undefined)).toBe(false);
	});
});

describe('vizPayloadFromCode', () => {
	it('returns the trimmed JSON payload for an aqsha:viz fence', () => {
		expect(vizPayloadFromCode('aqsha:viz', '  {"v":1}  ')).toBe('{"v":1}');
	});
	it('returns null for a normal code fence (falls through to Shiki)', () => {
		expect(vizPayloadFromCode('python', 'print(1)')).toBeNull();
	});
});
