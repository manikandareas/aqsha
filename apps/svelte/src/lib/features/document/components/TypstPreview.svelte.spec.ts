import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TypstPreview from './TypstPreview.svelte';

describe('TypstPreview', () => {
	it('menampilkan SVG hasil worker tanpa menjalankan renderer di main thread', async () => {
		render(TypstPreview, {
			svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Preview siap</text></svg>'
		});

		await expect.element(page.getByText('Preview siap')).toBeInTheDocument();
		await expect.element(page.getByText('Menyusun preview…')).not.toBeInTheDocument();
	});

	it('menampilkan banner tinjau tanpa menyuntikkan diff proposal ke SVG tersimpan', async () => {
		const savedSvgText = 'Versi dokumen tersimpan';
		render(TypstPreview, {
			svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>${savedSvgText}</text></svg>`,
			proposalHunkCount: 2
		});

		await expect.element(page.getByRole('button', { name: 'Tinjau usulan' })).toBeInTheDocument();
		await expect.element(page.getByText(savedSvgText)).toBeInTheDocument();
		const previewSvg = document.querySelector('.typst-preview-svg');
		expect(previewSvg?.textContent).toBe(savedSvgText);
	});
});
