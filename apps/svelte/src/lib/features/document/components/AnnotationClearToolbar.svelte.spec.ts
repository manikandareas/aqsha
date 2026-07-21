import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AnnotationClearToolbar from './AnnotationClearToolbar.svelte';

describe('AnnotationClearToolbar', () => {
	it('dismisses the initial visible-id snapshot after three seconds', async () => {
		vi.useFakeTimers();
		const onDismiss = vi.fn().mockResolvedValue(undefined);
		render(AnnotationClearToolbar, { visibleIds: ['a', 'b'], onDismiss });
		await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
		await expect.element(page.getByRole('button', { name: 'Batal clear' })).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(3000);
		expect(onDismiss).toHaveBeenCalledWith(['a', 'b']);
		vi.useRealTimers();
	});

	it('does not dismiss when user cancels before the deadline', async () => {
		vi.useFakeTimers();
		const onDismiss = vi.fn();
		render(AnnotationClearToolbar, { visibleIds: ['a'], onDismiss });
		await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
		await page.getByRole('button', { name: 'Batal clear' }).click();
		await vi.advanceTimersByTimeAsync(3000);
		expect(onDismiss).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
