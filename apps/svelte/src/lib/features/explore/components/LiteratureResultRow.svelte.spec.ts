import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

// SaveSourceButton (and its own project picker) pulls in `$env/dynamic/public` and the
// authenticated API client (Svelte context + TanStack QueryClient), none of which exist in
// an isolated component render outside SvelteKit's request pipeline. Stubbing the env virtual
// module and the mutation hook keeps this test focused on the row itself — SaveSourceButton
// has its own coverage where it's actually wired to a provider tree.
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/features/citations/api', () => ({
	useSaveSource: () => ({ mutate: vi.fn(), isPending: false })
}));

const { default: LiteratureResultRow } = await import('./LiteratureResultRow.svelte');

it('merender metadata sumber dan meneruskan canonical key saat dipilih', async () => {
	const onSelectedChange = vi.fn();
	render(LiteratureResultRow, {
		paper: {
			key: 'doi:10.1/climate',
			title: 'Climate adaptation',
			snippet: 'Abstract excerpt.',
			url: 'https://doi.org/10.1/climate',
			authors: ['A. Researcher'],
			year: 2024,
			venue: 'Journal',
			citedByCount: 42,
			isOpenAccess: true,
			hasPdf: true,
			workType: 'review',
			isRetracted: false,
			topics: []
		},
		selected: false,
		onSelectedChange
	});
	await expect.element(page.getByRole('link', { name: 'Climate adaptation' })).toBeVisible();
	await expect.element(page.getByText('42 sitasi')).toBeVisible();
	await expect.element(page.getByText('Open access')).toBeVisible();
	await page.getByRole('checkbox', { name: 'Pilih Climate adaptation' }).click();
	expect(onSelectedChange).toHaveBeenCalledWith('doi:10.1/climate', true);
});
