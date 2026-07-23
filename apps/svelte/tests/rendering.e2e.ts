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

	test('Explore membuka popover awal tanpa menjalankan search', async ({ page }) => {
		await page.goto('/app/explore');
		await page.getByRole('button', { name: 'Filter' }).click();
		await expect(page.getByRole('dialog', { name: 'Advanced search' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Advanced search' })).not.toBeVisible();
	});

	test('Explore menerapkan sidebar draft sekali di desktop', async ({ page }) => {
		await page.goto('/app/explore?q=climate');
		await expect(page.getByRole('complementary', { name: 'Advanced search' })).toBeVisible();
		await page.getByRole('button', { name: 'Dampak' }).click();
		await page.getByLabel('Minimal jumlah sitasi').fill('50');

		const requests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/papers/literature-search')) requests.push(request.url());
		});
		await page.getByRole('button', { name: 'Terapkan filter' }).click();

		await expect(page).toHaveURL(/(?:\?|&)f=/);
		expect(requests).toHaveLength(1);
	});

	test('Explore memakai drawer filter di mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/app/explore?q=climate');
		await page.getByRole('button', { name: 'Filter' }).click();
		await expect(page.getByRole('dialog', { name: 'Advanced search' })).toBeVisible();
	});
});
