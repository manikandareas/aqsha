import { describe, expect, it } from 'vitest';
import config from '../playwright.config';

describe('Playwright production server', () => {
	it('uses the pinned package manager for its build and preview', () => {
		expect(config.webServer).toMatchObject({
			command: 'bun run build && bun run preview',
			port: 4173
		});
	});
});
