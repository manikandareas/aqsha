import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const globalRoute = read('../../../../routes/app/(product)/library/+page.svelte');
const projectRoute = read(
	'../../../../routes/app/(product)/projects/[projectId]/references/+page.svelte'
);
const libraryPage = read('./LibraryPage.svelte');

describe('library page and route contracts', () => {
	it('global route passes an explicit global scope', () => {
		expect(globalRoute).toContain("scope={{ kind: 'global' }}");
	});

	it('project route derives scope from the parent workspace load', () => {
		expect(projectRoute).toContain('workspaceName: projectDisplayTitle(data.workspace)');
		expect(projectRoute).toContain('{#key data.workspace.id}');
		expect(projectRoute).toContain('<LibraryPage');
	});

	it('LibraryPage distinguishes project unlink from global delete', () => {
		expect(libraryPage).toContain('Lepas dari proyek');
		expect(libraryPage).toContain('Hapus dari Perpustakaan');
		expect(libraryPage).toContain('libraryBasePath(scope)');
	});
});
