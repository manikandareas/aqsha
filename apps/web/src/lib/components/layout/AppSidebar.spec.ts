import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./AppSidebar.svelte', import.meta.url), 'utf8');

describe('AppSidebar route hrefs', () => {
	it('does not pass already-resolved pathnames back into resolve during SSR', () => {
		expect(source).not.toContain('resolveNavHref');
		expect(source).not.toContain('navItem(resolve(');
		expect(source).toContain('{#snippet navItem(route: StaticNavRoute');
		expect(source).toContain('<a {...props} href={resolve(route)}>');
		expect(source).toContain('<a {...props} href={referencesHref}>');
	});

	it('resolves the project references submenu against a real route ID', () => {
		expect(source).toContain(
			"referencesHref = resolve('/app/(product)/projects/[projectId]/references'"
		);
		expect(source).not.toContain('no-navigation-without-resolve');
	});
});
