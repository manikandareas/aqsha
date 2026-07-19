// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Compartment } from '@codemirror/state';
import { latexEditorExtensions } from './latex-editor';

function makeState(doc: string, onChange: (v: string) => void) {
	const editableCompartment = new Compartment();
	const themeCompartment = new Compartment();
	return EditorState.create({
		doc,
		extensions: latexEditorExtensions({
			editable: true,
			dark: false,
			onChange,
			editableCompartment,
			themeCompartment
		})
	});
}

describe('latexEditorExtensions', () => {
	it('membangun state yang mempertahankan dokumen awal', () => {
		const state = makeState('\\section{Halo}', () => {});
		expect(state.doc.toString()).toBe('\\section{Halo}');
	});

	it('menandai read-only ketika editable=false via compartment', () => {
		const editableCompartment = new Compartment();
		const themeCompartment = new Compartment();
		const state = EditorState.create({
			doc: 'x',
			extensions: latexEditorExtensions({
				editable: false,
				dark: false,
				onChange: () => {},
				editableCompartment,
				themeCompartment
			})
		});
		expect(state.readOnly).toBe(true);
	});

	it('mengekspos anotasi ExternalSync untuk menyaring reset programatik', async () => {
		const mod = await import('./latex-editor');
		expect(mod.ExternalSync).toBeDefined();
	});
});
