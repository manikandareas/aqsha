import { describe, expect, it } from 'vitest';
import { buildAnnotationClientContext } from './annotation-context';
import type { AnnotationView } from '../api';

const base: AnnotationView = {
	id: 'a1',
	kind: 'highlight',
	page: 2,
	rects: [{ x: 1, y: 2, w: 3, h: 4 }],
	selectedText: 'metode kuantitatif',
	note: 'perjelas alasannya',
	sourceFile: 'sections/s1.tex',
	sourceLine: 14,
	sourceVersion: 3,
	status: 'open',
	threadId: null,
	messageId: null,
	createdAt: 0,
	updatedAt: 0
};

describe('buildAnnotationClientContext', () => {
	it('memuat sectionId, judul, dan detail tiap anotasi', () => {
		const out = buildAnnotationClientContext({
			sectionId: 's1',
			sectionTitle: 'Bab 1 Pendahuluan',
			annotations: [base]
		});
		expect(out).toContain('s1');
		expect(out).toContain('Bab 1 Pendahuluan');
		expect(out).toContain('a1');
		expect(out).toContain('metode kuantitatif');
		expect(out).toContain('perjelas alasannya');
		expect(out).toContain('baris 14');
	});
	it('anotasi tanpa mapping tetap termuat tanpa baris', () => {
		const out = buildAnnotationClientContext({
			sectionId: 's1',
			sectionTitle: 'Bab 1',
			annotations: [{ ...base, sourceLine: null, sourceFile: null }]
		});
		expect(out).toContain('a1');
		expect(out).not.toContain('baris');
	});
});
