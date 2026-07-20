import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ThreadHistoryControls } from '$lib/features/threads/lib/thread-history';
import OlderHistorySentinel from './OlderHistorySentinel.svelte';

function historyControls(
	overrides: Partial<ThreadHistoryControls> & { loadOlder?: () => Promise<void> } = {}
): ThreadHistoryControls {
	return {
		hasOlder: true,
		isLoadingOlder: false,
		loadError: null,
		loadOlder: overrides.loadOlder ?? (async () => {}),
		...overrides
	};
}

describe('OlderHistorySentinel', () => {
	it('shows loading, retry, and terminal states', async () => {
		const loading = render(OlderHistorySentinel, {
			history: historyControls({ isLoadingOlder: true })
		});
		await expect.element(page.getByText('Memuat pesan lama…')).toBeInTheDocument();
		loading.unmount();

		const retry = render(OlderHistorySentinel, {
			history: historyControls({ loadError: 'Jaringan terputus' })
		});
		await expect.element(page.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
		retry.unmount();

		render(OlderHistorySentinel, {
			history: historyControls({ hasOlder: false })
		});
		await expect.element(page.getByText('Awal percakapan')).toBeInTheDocument();
	});

	it('prevents concurrent retry requests', async () => {
		let release!: () => void;
		const loadOlder = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
		render(OlderHistorySentinel, {
			history: historyControls({ loadError: 'Gagal', loadOlder })
		});
		const retry = page.getByRole('button', { name: 'Coba lagi' });

		await retry.click();
		await retry.click();
		expect(loadOlder).toHaveBeenCalledTimes(1);
		release();
	});
});
