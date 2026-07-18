import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionAutosave } from './autosave.svelte';

function makeSave(
	results: Array<
		| { status: 'saved'; artifactId: string; contentVersion: number; sectionStatus: string }
		| { status: 'stale_write'; currentVersion: number }
	>
) {
	let i = 0;
	return vi.fn(async () => results[Math.min(i++, results.length - 1)]);
}

describe('SectionAutosave', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('debounce: satu save setelah idle', async () => {
		const save = makeSave([
			{ status: 'saved', artifactId: 'a', contentVersion: 1, sectionStatus: 'draft' }
		]);
		const auto = new SectionAutosave({
			debounceMs: 2000,
			maxIntervalMs: 15000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale: () => {}
		});
		auto.markDirty();
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(2100);
		expect(save).toHaveBeenCalledTimes(1);
		expect(auto.state).toBe('idle');
		auto.dispose();
	});

	it('stale_write menghentikan penjadwalan sampai retry', async () => {
		const save = makeSave([{ status: 'stale_write', currentVersion: 7 }]);
		const onStale = vi.fn();
		const auto = new SectionAutosave({
			debounceMs: 100,
			maxIntervalMs: 1000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale
		});
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(onStale).toHaveBeenCalledWith(7);
		expect(auto.state).toBe('stale');
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(2000);
		expect(save).toHaveBeenCalledTimes(1);
		auto.dispose();
	});

	it('save gagal → error, retry menjadwalkan ulang', async () => {
		const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
			status: 'saved',
			artifactId: 'a',
			contentVersion: 2,
			sectionStatus: 'draft'
		});
		const auto = new SectionAutosave({
			debounceMs: 100,
			maxIntervalMs: 1000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale: () => {}
		});
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(auto.state).toBe('error');
		auto.retry();
		await vi.advanceTimersByTimeAsync(200);
		expect(auto.state).toBe('idle');
		auto.dispose();
	});
});
