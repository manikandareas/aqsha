import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LiteratureFilterEditor from './LiteratureFilterEditor.svelte';

it('menahan filter sebagai draft sampai Apply', async () => {
	const onApply = vi.fn();
	const onReset = vi.fn();
	render(LiteratureFilterEditor, {
		catalog: {
			categories: [{ id: 'impact', label: 'Dampak' }],
			filters: [
				{ id: 'citation_count', category: 'impact', label: 'Jumlah sitasi', kind: 'number-range' }
			]
		},
		draft: { q: 'climate', sort: 'relevance', filters: [] },
		onChange: vi.fn(),
		onApply,
		onReset
	});
	await page.getByRole('button', { name: 'Dampak' }).click();
	await page.getByLabelText('Minimal jumlah sitasi').fill('50');
	expect(onApply).not.toHaveBeenCalled();
	await page.getByRole('button', { name: 'Terapkan filter' }).click();
	expect(onApply).toHaveBeenCalledOnce();
	await page.getByRole('button', { name: 'Reset filter' }).click();
	expect(onReset).toHaveBeenCalledOnce();
});
