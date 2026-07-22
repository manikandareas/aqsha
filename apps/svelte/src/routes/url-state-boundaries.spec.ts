import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const routeSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('same-page URL state', () => {
	it.each([
		'../lib/features/explore/components/ExplorePage.svelte',
		'../lib/features/citations/pages/LibraryPage.svelte'
	])('%s uses shallow state replacement', (path) => {
		const source = routeSource(path);

		expect(source).toContain("import { replaceState } from '$app/navigation'");
		expect(source).toContain('replaceState(');
		expect(source).toContain('page.state');
		expect(source).toContain("resolve('/app/(product)/");
		expect(source).not.toContain('goto(url');
	});
});
