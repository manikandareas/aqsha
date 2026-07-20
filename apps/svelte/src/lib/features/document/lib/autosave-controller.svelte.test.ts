import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveController } from './autosave-controller.svelte';
import type { SaveWorkspaceDocumentResult } from '../api';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function savedResult(version: number): SaveWorkspaceDocumentResult {
	return { status: 'saved', artifactId: 'a', contentVersion: version };
}

describe('AutosaveController', () => {
	it('men-debounce edit lalu menyimpan sekali dengan baseVersion awal', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 500, save });
		c.edit('a');
		c.edit('ab');
		c.edit('abc');
		expect(save).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith({ source: 'abc', baseVersion: 3 });
		expect(c.version).toBe(4);
		expect(c.status).toBe('saved');
	});

	it('memakai versi hasil simpan sebagai baseVersion simpan berikutnya', async () => {
		const save = vi
			.fn<(i: { source: string; baseVersion: number }) => Promise<SaveWorkspaceDocumentResult>>()
			.mockResolvedValueOnce(savedResult(4))
			.mockResolvedValueOnce(savedResult(5));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 100, save });
		c.edit('one');
		await vi.advanceTimersByTimeAsync(100);
		c.edit('two');
		await vi.advanceTimersByTimeAsync(100);
		expect(save.mock.calls[1]![0]).toEqual({ source: 'two', baseVersion: 4 });
		expect(c.version).toBe(5);
	});

	it('menandai status stale saat server mengembalikan stale_write', async () => {
		const save = vi.fn(async (): Promise<SaveWorkspaceDocumentResult> => ({
			status: 'stale_write',
			currentVersion: 9
		}));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });
		c.edit('x');
		await vi.advanceTimersByTimeAsync(10);
		expect(c.status).toBe('stale');
		expect(c.version).toBe(9); // versi server terbaru diketahui, tapi buffer tetap milik user
	});

	it('flush menyimpan langsung tanpa menunggu debounce', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 5000, save });
		c.edit('halo');
		await c.flush();
		expect(save).toHaveBeenCalledTimes(1);
		expect(c.status).toBe('saved');
	});

	it('flush menunggu simpan aktif lalu menyimpan edit yang menumpuk', async () => {
		let resolveFirst!: (result: SaveWorkspaceDocumentResult) => void;
		const firstSave = new Promise<SaveWorkspaceDocumentResult>((resolve) => {
			resolveFirst = resolve;
		});
		const save = vi
			.fn<(i: { source: string; baseVersion: number }) => Promise<SaveWorkspaceDocumentResult>>()
			.mockImplementationOnce(() => firstSave)
			.mockResolvedValueOnce(savedResult(5));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });

		c.edit('awal');
		await vi.advanceTimersByTimeAsync(10);
		c.edit('terbaru');
		const flushed = c.flush();
		resolveFirst(savedResult(4));
		await flushed;

		expect(save).toHaveBeenCalledTimes(2);
		expect(save.mock.calls[1]![0]).toEqual({ source: 'terbaru', baseVersion: 4 });
		expect(c.status).toBe('saved');
	});

	it('flush tidak menimpa perubahan remote setelah simpan aktif menjadi stale', async () => {
		let resolveFirst!: (result: SaveWorkspaceDocumentResult) => void;
		const firstSave = new Promise<SaveWorkspaceDocumentResult>((resolve) => {
			resolveFirst = resolve;
		});
		const save = vi.fn(() => firstSave);
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });

		c.edit('awal');
		await vi.advanceTimersByTimeAsync(10);
		c.edit('terbaru');
		const flushed = c.flush();
		resolveFirst({ status: 'stale_write', currentVersion: 9 });
		await flushed;

		expect(save).toHaveBeenCalledTimes(1);
		expect(c.status).toBe('stale');
		expect(c.version).toBe(9);
	});

	it('reset memulai ulang versi dan mengosongkan status kotor', async () => {
		const save = vi.fn(async () => savedResult(4));
		const c = new AutosaveController({ initialVersion: 3, debounceMs: 10, save });
		c.edit('x');
		c.reset(7);
		expect(c.version).toBe(7);
		expect(c.status).toBe('idle');
		await vi.advanceTimersByTimeAsync(10);
		expect(save).not.toHaveBeenCalled(); // edit sebelum reset dibatalkan
	});
});
