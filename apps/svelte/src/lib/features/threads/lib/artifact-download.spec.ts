import { describe, expect, it } from 'vitest';
import { base64ToBytes } from './artifact-download';

// Byte-equivalence contract (§11.2): base64 decode must produce exactly the same bytes as the web
// `triggerBase64Download` loop (docx/xlsx exports). A drift here would corrupt downloaded files.

describe('base64ToBytes', () => {
	it('decodes ascii base64 to the exact byte sequence', () => {
		// "Aqsha" → base64 "QXFzaGE=" — bytes 65 113 115 104 97.
		expect(Array.from(base64ToBytes('QXFzaGE='))).toEqual([65, 113, 115, 104, 97]);
	});

	it('round-trips arbitrary binary bytes (matches web charCodeAt loop)', () => {
		const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
		let binary = '';
		for (const byte of original) binary += String.fromCharCode(byte);
		const base64 = btoa(binary);
		expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(original));
	});

	it('decodes an empty payload to an empty buffer', () => {
		expect(base64ToBytes('').length).toBe(0);
	});
});
