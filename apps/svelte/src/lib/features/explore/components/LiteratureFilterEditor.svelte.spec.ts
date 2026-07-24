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
		draft: { q: 'climate', filters: [] },
		onChange: vi.fn(),
		onApply,
		onReset
	});
	await page.getByLabelText('Minimal jumlah sitasi').fill('50');
	expect(onApply).not.toHaveBeenCalled();
	await page.getByRole('button', { name: 'Terapkan filter' }).click();
	expect(onApply).toHaveBeenCalledOnce();
	await page.getByRole('button', { name: 'Reset filter' }).click();
	expect(onReset).toHaveBeenCalledOnce();
});

it('opens Publikasi first and lets each category collapse independently', async () => {
	render(LiteratureFilterEditor, {
		catalog: {
			categories: [
				{ id: 'publication', label: 'Publikasi' },
				{ id: 'impact', label: 'Dampak' }
			],
			filters: [
				{
					id: 'publication_date',
					category: 'publication',
					label: 'Tanggal publikasi',
					kind: 'date-range'
				},
				{
					id: 'citation_count',
					category: 'impact',
					label: 'Jumlah sitasi',
					kind: 'number-range'
				}
			]
		},
		draft: { q: 'climate', filters: [] },
		onChange: vi.fn(),
		onApply: vi.fn(),
		onReset: vi.fn()
	});

	await expect.element(page.getByLabelText('Mulai tanggal publikasi')).toBeVisible();
	await expect.element(page.getByLabelText('Minimal jumlah sitasi')).not.toBeVisible();
	await page.getByRole('button', { name: 'Publikasi' }).click();
	await expect.element(page.getByLabelText('Mulai tanggal publikasi')).not.toBeVisible();
	await page.getByRole('button', { name: 'Dampak' }).click();
	await expect.element(page.getByLabelText('Minimal jumlah sitasi')).toBeVisible();
});
