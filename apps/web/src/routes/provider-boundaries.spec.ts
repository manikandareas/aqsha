import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
	return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('route provider boundaries', () => {
	it('menjaga root layout bebas dari runtime auth dan product', async () => {
		const root = await source('./+layout.svelte');

		expect(root).not.toContain('ClerkProvider');
		expect(root).not.toContain('QueryClientProvider');
		expect(root).not.toContain('OnboardingGate');
		expect(root).not.toContain('AppLoadingOverlay');
	});

	it('memasang provider hanya pada route group yang membutuhkan', async () => {
		const [marketing, auth, app, onboarding] = await Promise.all([
			source('./(marketing)/+layout.svelte'),
			source('./(auth)/+layout.svelte'),
			source('./app/+layout.svelte'),
			source('./onboarding/+layout.svelte')
		]);

		expect(marketing).toContain('ThemeProvider');
		expect(marketing).toContain('MotionProvider');
		expect(marketing).not.toContain('ClerkProvider');
		expect(auth).toContain('ClerkProvider');
		expect(app).toContain('QueryClientProvider');
		expect(app).toContain('ClerkProvider');
		expect(onboarding).toContain('QueryClientProvider');
		expect(onboarding).toContain('ClerkProvider');
	});

	it('memprerender marketing dan menyediakan entries untuk slug dinamis', async () => {
		const [options, blog, changelog] = await Promise.all([
			source('./(marketing)/+layout.ts'),
			source('./(marketing)/blog/[slug]/+page.server.ts'),
			source('./(marketing)/changelog/[slug]/+page.server.ts')
		]);

		expect(options).toContain('prerender = true');
		expect(blog).toContain('export const entries');
		expect(changelog).toContain('export const entries');
	});
});
