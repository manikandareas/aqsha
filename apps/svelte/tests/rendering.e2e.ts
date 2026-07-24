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

	test('Explore menampilkan rail filter sejak landing desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 960 });
		await page.goto('/app/explore');
		await expect(page.getByRole('complementary', { name: 'Filter penelitian' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Filter' })).toBeHidden();
		await expect(page.getByRole('dialog', { name: 'Advanced search' })).toHaveCount(0);
	});

	test('Explore menerapkan sidebar draft sekali di desktop', async ({ page }) => {
		await page.goto('/app/explore?q=climate');
		await expect(page.getByRole('complementary', { name: 'Filter penelitian' })).toBeVisible();
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

	test('Explore immediately switches from landing to results after a query submit', async ({
		page
	}) => {
		await page.goto('/app/explore');
		await page.getByLabel('Cari paper').fill('transformer neural networks');
		await page.getByRole('button', { name: 'Cari' }).click();

		await expect(page).toHaveURL(/(?:\?|&)q=transformer(?:\+|%20)neural(?:\+|%20)networks/);
		await expect(page.getByRole('heading', { name: 'Cari literatur' })).toBeHidden();
		await expect(page.getByText('Urutkan')).toBeVisible();
	});

	test('Explore membuka drawer filter dari landing mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/app/explore');
		await page.getByRole('button', { name: 'Filter' }).click();
		await expect(page.getByRole('dialog', { name: 'Filter penelitian' })).toBeVisible();
		await expect(page.getByRole('complementary', { name: 'Filter penelitian' })).toBeHidden();
	});

	test('Explore keeps desktop filters usable and feed is a source list without an ad banner', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1440, height: 960 });
		await page.goto('/app/explore');

		const rail = page.getByRole('complementary', { name: 'Filter penelitian' });
		await expect(rail).toBeVisible();
		await expect(rail.getByLabel('Mulai tanggal publikasi')).toBeVisible();
		await rail.getByRole('button', { name: 'Publikasi' }).click();
		await expect(rail.getByLabel('Mulai tanggal publikasi')).toBeHidden();
		await rail.getByRole('button', { name: 'Dampak' }).click();
		await expect(rail.getByLabel('Minimal jumlah sitasi')).toBeVisible();

		const feed = page.getByLabel('Temuan untukmu');
		await expect(feed).toBeVisible();
		await expect(feed.locator('article').first()).toBeVisible();
		await expect(feed.getByRole('img')).toHaveCount(0);
		await expect(page.getByText('Baca selengkapnya')).toHaveCount(0);
	});
});
