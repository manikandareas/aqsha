import { describe, expect, it } from 'vitest';
import { landingGreeting } from './landing-greeting';

describe('landingGreeting', () => {
	it.each([
		[2, 'Selamat malam, Vito'],
		[5, 'Selamat pagi, Vito'],
		[11, 'Selamat siang, Vito'],
		[15, 'Selamat sore, Vito'],
		[18, 'Selamat malam, Vito'],
		[23, 'Selamat malam, Vito']
	])('uses the local hour %i for a named viewer', (hour, expected) => {
		expect(landingGreeting('Vito', hour)).toBe(expected);
	});

	it('keeps the greeting useful when a profile has no name', () => {
		expect(landingGreeting('', 15)).toBe('Selamat sore');
	});
});
