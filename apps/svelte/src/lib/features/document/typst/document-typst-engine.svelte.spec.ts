import { describe, expect, it } from 'vitest';
import { VedivadDocumentTypstEngine } from './document-typst-engine';

describe('VedivadDocumentTypstEngine', () => {
	it('menghasilkan preview dan diagnostics dari project yang sama', async () => {
		const engine = await VedivadDocumentTypstEngine.create({ mainFilePath: '/skripsi.typ' });
		try {
			const compiled = new Promise<{ svg: string | null; diagnostics: unknown[] }>(
				(resolve, reject) => {
					engine.onCompiled(resolve);
					engine.onError((message) => reject(new Error(message)));
				}
			);

			await engine.update('= Preview Vedivad\n\nDokumen tetap responsif.', '', '/skripsi.typ');
			const result = await compiled;

			expect(engine.project.entry).toBe('/skripsi.typ');
			expect(result.svg).toContain('typst-page');
			expect(engine.project.getText('/skripsi.typ')).toContain('Preview Vedivad');
			expect(result.diagnostics).toEqual([]);
		} finally {
			engine.dispose();
		}
	}, 60_000);

	it('memenangkan update terbaru saat render sebelumnya masih berjalan', async () => {
		const engine = await VedivadDocumentTypstEngine.create();
		try {
			const latest = new Promise<string>((resolve, reject) => {
				engine.onCompiled((result) => {
					if (result.svg) resolve(result.svg);
				});
				engine.onError((message) => reject(new Error(message)));
			});

			void engine.update('= Render lama', '');
			await engine.update('= Render terbaru', '');
			expect(await latest).toContain('typst-page');
			expect(engine.project.getText('/main.typ')).toBe('= Render terbaru');
		} finally {
			engine.dispose();
		}
	}, 60_000);
});
