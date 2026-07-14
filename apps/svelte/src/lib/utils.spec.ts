import { describe, expect, it } from 'vitest';
import { cn } from './utils';

// Server (node) project smoke: proves the pure Vitest lane works and that the
// shadcn `cn` helper (clsx + tailwind-merge) resolves conflicts correctly.
describe('cn', () => {
	it('merges class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});

	it('resolves tailwind conflicts (last wins)', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});

	it('drops falsy conditional classes', () => {
		expect(cn('a', { b: false, c: true }, null, undefined)).toBe('a c');
	});
});
