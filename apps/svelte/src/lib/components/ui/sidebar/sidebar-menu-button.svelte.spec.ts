import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Fixture from './sidebar-active-fixture.svelte';

// Regression guard: Tailwind's `data-active:` utility compiles to a PRESENCE selector
// (`[data-active]`), and Svelte renders `data-active={false}` as the string "false" (attribute
// present) — so a bare `data-active={isActive}` lights up EVERY menu button, not just the active
// one. The component omits the attribute when inactive (`isActive || undefined`); this test locks
// that in so a shadcn-svelte `add` regen can't silently bring the bug back.
it('SidebarMenuButton sets data-active only when active', async () => {
	render(Fixture);

	const active = page.getByTestId('active-button');
	const inactive = page.getByTestId('inactive-button');

	await expect.element(active).toHaveAttribute('data-active', 'true');
	await expect.element(inactive).not.toHaveAttribute('data-active');
});
