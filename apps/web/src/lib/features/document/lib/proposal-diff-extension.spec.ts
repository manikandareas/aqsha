// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProposalHunk } from '../api';
import {
	proposalDiffExtension,
	type ProposalDiffState,
	setProposalDiff
} from './proposal-diff-extension';

const DOC = ['= Bab Satu', '', 'Alpha.', '', ''].join('\n');

const HUNK: ProposalHunk = {
	index: 0,
	oldStart: 3,
	oldLines: 1,
	newStart: 3,
	newLines: 2,
	lines: [' ', '-Alpha.', '+Alpha diperluas.', '+Tambahan baris kedua.']
};

function diffState(overrides: Partial<ProposalDiffState> = {}): ProposalDiffState {
	return {
		hunks: [HUNK],
		labelFor: () => 'Bab Satu',
		busyIndex: null,
		errors: {},
		onDecide: () => {},
		...overrides
	};
}

let view: EditorView | null = null;

function mount(doc = DOC): EditorView {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({
		parent,
		state: EditorState.create({ doc, extensions: [proposalDiffExtension()] })
	});
	return view;
}

afterEach(() => {
	view?.destroy();
	view = null;
	document.body.innerHTML = '';
});

describe('proposalDiffExtension', () => {
	it('tidak menggambar apa pun sebelum ada usulan', () => {
		const v = mount();
		expect(v.dom.querySelector('.cm-proposal-bar')).toBeNull();
		expect(v.dom.querySelector('.cm-proposal-added')).toBeNull();
	});

	// Regresi: block widget yang disediakan lewat ViewPlugin ditolak CodeMirror sehingga SELURUH
	// dekorasi dibuang dan editor tampak kosong. Tes ini memastikan widget benar-benar sampai ke DOM.
	it('menggambar action bar dan blok baris tambahan ke DOM', () => {
		const v = mount();
		v.dispatch({ effects: setProposalDiff.of(diffState()) });

		expect(v.dom.querySelector('.cm-proposal-bar')).not.toBeNull();
		const added = v.dom.querySelector('.cm-proposal-added');
		expect(added).not.toBeNull();
		expect(added?.textContent).toContain('Alpha diperluas.');
		expect(added?.textContent).toContain('Tambahan baris kedua.');
		expect(v.dom.querySelector('.cm-proposal-removed')).not.toBeNull();
	});

	it('memberi label hunk dan tombol keputusan pada action bar', () => {
		const v = mount();
		v.dispatch({ effects: setProposalDiff.of(diffState()) });

		const bar = v.dom.querySelector('.cm-proposal-bar');
		expect(bar?.querySelector('.cm-proposal-bar-label')?.textContent).toBe('Bab Satu');
		expect(bar?.querySelectorAll('.cm-proposal-bar-action')).toHaveLength(2);
	});

	it('meneruskan keputusan hunk saat tombol diklik', () => {
		const decisions: Array<[number, string]> = [];
		const v = mount();
		v.dispatch({
			effects: setProposalDiff.of(
				diffState({ onDecide: (index, decision) => decisions.push([index, decision]) })
			)
		});

		v.dom.querySelector<HTMLButtonElement>('.cm-proposal-bar-accept')?.click();
		expect(decisions).toEqual([[0, 'accept']]);
	});

	it('menonaktifkan tombol saat ada hunk yang sedang diproses', () => {
		const v = mount();
		v.dispatch({ effects: setProposalDiff.of(diffState({ busyIndex: 0 })) });

		const buttons = v.dom.querySelectorAll<HTMLButtonElement>('.cm-proposal-bar-action');
		expect([...buttons].every((b) => b.disabled)).toBe(true);
	});

	it('menampilkan galat compile pada hunk terkait', () => {
		const v = mount();
		v.dispatch({ effects: setProposalDiff.of(diffState({ errors: { 0: ['baris 3: unclosed'] } })) });

		expect(v.dom.querySelector('.cm-proposal-bar-error')?.textContent).toContain('unclosed');
	});

	it('membersihkan dekorasi saat usulan ditutup', () => {
		const v = mount();
		v.dispatch({ effects: setProposalDiff.of(diffState()) });
		v.dispatch({ effects: setProposalDiff.of(null) });

		expect(v.dom.querySelector('.cm-proposal-bar')).toBeNull();
		expect(v.dom.querySelector('.cm-proposal-added')).toBeNull();
	});
});
