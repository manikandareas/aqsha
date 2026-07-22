import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const previewSource = readFileSync(
	new URL('../components/TypstPreview.svelte', import.meta.url),
	'utf8'
);
const engineSource = readFileSync(new URL('./document-typst-engine.ts', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../lib/typst-editor.ts', import.meta.url), 'utf8');

describe('Typst runtime boundary', () => {
	it('memakai satu TypstProject Vedivad untuk compile, render, dan editor intelligence', () => {
		expect(previewSource).not.toContain('getTypstRenderer');
		expect(previewSource).not.toContain('@myriaddreamin/typst.ts/renderer');
		expect(engineSource).toContain('TypstProject.create');
		expect(engineSource).toContain('renderedPages');
		expect(engineSource).toContain("'/refs.bib'");
		expect(engineSource).not.toContain('@myriaddreamin');
		expect(editorSource).not.toContain('TypstProject.create');
		expect(editorSource).toContain('project: TypstProject | null');
	});
});
