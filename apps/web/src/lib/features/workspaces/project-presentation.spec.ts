import { describe, expect, it } from 'vitest';
import { projectAccent } from './project-presentation';

describe('projectAccent', () => {
	it('maps every workspace kind to a stable candy accent', () => {
		expect(projectAccent('undergraduate_thesis')).toBe('mint');
		expect(projectAccent('masters_thesis')).toBe('lavender');
		expect(projectAccent('dissertation')).toBe('coral');
		expect(projectAccent('journal_article')).toBe('lavender');
		expect(projectAccent('proposal')).toBe('coral');
		expect(projectAccent('paper')).toBe('lemon');
		expect(projectAccent('freeform')).toBe('mint');
	});
});
