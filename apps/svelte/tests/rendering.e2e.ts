import { expect, test } from '@playwright/test';

test('marketing HTML excludes authenticated product runtimes', async ({ request }) => {
	const response = await request.get('/');
	const html = await response.text();

	expect(response.ok()).toBe(true);
	expect(html).not.toMatch(/svelte-clerk|tanstack|typsten/i);
});

test('protected app entry redirects an anonymous request to sign in', async ({ request }) => {
	const response = await request.get('/app', { maxRedirects: 0 });

	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe('/sign-in');
});

test.describe('authenticated rendering', () => {
	const storageState = process.env.PLAYWRIGHT_AUTH_STATE;
	test.skip(!storageState, 'PLAYWRIGHT_AUTH_STATE is required for authenticated production E2E.');
	test.use({ storageState: storageState ?? undefined });

	test('Explore filter updates shallowly without requesting new page data', async ({ page }) => {
		await page.goto('/app/explore');
		await expect(page.getByRole('button', { name: 'Sains & Teknologi' })).toBeVisible();

		const pageDataRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('__data.json')) pageDataRequests.push(request.url());
		});

		await page.getByRole('button', { name: 'Sains & Teknologi' }).click();
		await expect(page).toHaveURL(/topic=sains_teknologi/);
		expect(pageDataRequests).toEqual([]);
	});
});
