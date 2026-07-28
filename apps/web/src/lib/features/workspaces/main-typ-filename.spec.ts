import { describe, expect, it } from 'vitest';
import { WORKSPACE_KINDS } from './types';
import {
	MAIN_TYP_FILENAMES,
	mainTypFilePath,
	mainTypFilename,
	resolveMainTypFilename
} from './main-typ-filename';

describe('mainTypFilename', () => {
	it('memetakan setiap WorkspaceKind ke basename .typ', () => {
		for (const kind of WORKSPACE_KINDS) {
			expect(mainTypFilename(kind)).toBe(MAIN_TYP_FILENAMES[kind]);
			expect(MAIN_TYP_FILENAMES[kind].endsWith('.typ')).toBe(true);
		}
	});

	it('freeform → main.typ; undergraduate_thesis → skripsi.typ', () => {
		expect(mainTypFilename('freeform')).toBe('main.typ');
		expect(mainTypFilename('undergraduate_thesis')).toBe('skripsi.typ');
		expect(mainTypFilename('journal_article')).toBe('artikel-jurnal.typ');
	});

	it('resolveMainTypFilename jatuh ke main.typ untuk unknown', () => {
		expect(resolveMainTypFilename(undefined)).toBe('main.typ');
		expect(resolveMainTypFilename('not-a-kind')).toBe('main.typ');
		expect(resolveMainTypFilename('paper')).toBe('makalah.typ');
	});

	it('mainTypFilePath menambah leading slash', () => {
		expect(mainTypFilePath('masters_thesis')).toBe('/tesis.typ');
	});
});
