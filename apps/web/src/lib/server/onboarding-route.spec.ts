import { describe, expect, it, vi } from 'vitest';
import { onboardingRedirect } from './onboarding-route';

describe('onboarding route guard', () => {
	it('mengalihkan user incomplete saat memasuki app', async () => {
		const status = vi.fn(async () => ({ completed: false }));

		expect(await onboardingRedirect('app', status)).toBe('/onboarding');
		expect(status).toHaveBeenCalledTimes(1);
	});

	it('mengalihkan user completed keluar dari onboarding', async () => {
		expect(await onboardingRedirect('onboarding', async () => ({ completed: true }))).toBe('/app');
	});

	it('fail-open ketika status API gagal', async () => {
		expect(
			await onboardingRedirect('app', async () => Promise.reject(new Error('api unavailable')))
		).toBeNull();
	});
});
