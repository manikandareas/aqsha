import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/features/citations/api', () => ({
	useSaveSource: () => ({ mutate: vi.fn(), isPending: false })
}));

const { default: ExploreFeedSourceRow } = await import('./ExploreFeedSourceRow.svelte');

it('renders a discovery item as a source row and keeps hide action reachable', async () => {
	const onHide = vi.fn();
	render(ExploreFeedSourceRow, {
		item: {
			_id: 'feed-1',
			kind: 'paper',
			title: 'Community-led climate adaptation',
			summary: 'A source summary.',
			url: 'https://example.test/paper',
			provider: 'OpenAlex',
			sourceLabel: 'Journal of Climate',
			authors: ['A. Researcher'],
			year: 2024,
			citedByCount: 42,
			isOpenAccess: true,
			topics: ['Climate'],
			itemRef: { kind: 'feed', feedItemId: 'feed-1' }
		},
		handlers: { onSaved: vi.fn(), onHide }
	});

	await expect
		.element(page.getByRole('link', { name: 'Community-led climate adaptation' }))
		.toBeVisible();
	await expect.element(page.getByText('42 sitasi')).toBeVisible();
	await page.getByRole('button', { name: 'Tindakan lain' }).click();
	await page.getByText('Tidak relevan').click();
	expect(onHide).toHaveBeenCalledOnce();
});
