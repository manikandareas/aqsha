import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LiteratureSearchHero from './LiteratureSearchHero.svelte';

it('keeps landing search focused and delegates Filter to its parent', async () => {
	const onOpenFilters = vi.fn();
	render(LiteratureSearchHero, {
		value: '',
		onValueChange: vi.fn(),
		onSubmit: vi.fn(),
		onOpenFilters
	});
	await expect.element(page.getByRole('heading', { name: 'Cari literatur' })).toBeVisible();
	await page.getByRole('button', { name: 'Filter' }).click();
	expect(onOpenFilters).toHaveBeenCalledOnce();
});
