import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const globalRoute = read('../../../../routes/app/(product)/library/+page.svelte');
const projectRoute = read(
	'../../../../routes/app/(product)/projects/[projectId]/references/+page.svelte'
);
const libraryPage = read('./LibraryPage.svelte');
const canonicalReader = read('../../../../routes/app/(product)/artifacts/[artifactId]/+page.svelte');
const projectReader = read(
	'../../../../routes/app/(product)/projects/[projectId]/artifacts/[artifactId]/+page.ts'
);
const detailView = read('../components/CitationDetailView.svelte');

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

describe('reader route contracts', () => {
	it('canonical reader needs no workspace', () => {
		expect(canonicalReader).toContain('ArtifactReaderPageShell');
		expect(canonicalReader).not.toContain('projectId');
	});

	it('project reader redirects to the canonical route', () => {
		expect(projectReader).toContain('redirect(');
		expect(projectReader).toContain('project=');
	});

	it('detail view links to the reader without requiring a workspace', () => {
		expect(detailView).toContain("resolve('/app/(product)/artifacts/[artifactId]'");
		expect(detailView).not.toContain('citation.artifactId && workspaceId');
	});
});
