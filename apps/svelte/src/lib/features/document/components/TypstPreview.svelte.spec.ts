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
});
