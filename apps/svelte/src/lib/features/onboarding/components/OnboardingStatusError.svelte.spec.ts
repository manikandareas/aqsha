import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OnboardingStatusError from './OnboardingStatusError.svelte';

it('announces the status error and retries on demand', async () => {
	const onretry = vi.fn();
	render(OnboardingStatusError, {
		message: 'Belum bisa memeriksa status onboarding.',
		onretry
	});

	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Belum bisa memeriksa status onboarding.');
	await page.getByRole('button', { name: 'Coba lagi' }).click();
	expect(onretry).toHaveBeenCalledOnce();
});
