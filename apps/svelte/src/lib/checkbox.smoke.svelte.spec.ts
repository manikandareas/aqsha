import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';

// Client (browser) project smoke: proves vitest-browser-svelte renders a real
// Svelte 5 runes component (a shadcn-svelte primitive backed by Bits UI) in a
// headless Chromium instance. This is the component/interaction test lane for browser-rendered
// Svelte components.
it('renders a shadcn-svelte checkbox in checked state', async () => {
	render(Checkbox, { checked: true });
	const checkbox = page.getByRole('checkbox');
	await expect.element(checkbox).toBeInTheDocument();
	await expect.element(checkbox).toHaveAttribute('aria-checked', 'true');
});
