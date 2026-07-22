import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OnboardingStepIndicator from './OnboardingStepIndicator.svelte';

it('announces current onboarding progress without relying on color or motion', async () => {
	render(OnboardingStepIndicator, { index: 3, total: 5 });
	await expect.element(page.getByRole('status')).toHaveAttribute('aria-label', 'Langkah 3 dari 5');
	await expect.element(page.getByText('3', { exact: true })).toBeInTheDocument();
	await expect.element(page.getByText('dari 5')).toBeInTheDocument();
});
