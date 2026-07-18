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

	it('dirty saat in-flight → save susulan terjadwal setelah save pertama selesai', async () => {
		let resolveFirstSave!: (r: {
			status: 'saved';
			artifactId: string;
			contentVersion: number;
			sectionStatus: string;
		}) => void;
		const firstSave = new Promise<{
			status: 'saved';
			artifactId: string;
			contentVersion: number;
			sectionStatus: string;
		}>((resolve) => {
			resolveFirstSave = resolve;
		});
		const save = vi
			.fn()
			.mockImplementationOnce(() => firstSave)
			.mockResolvedValueOnce({
				status: 'saved',
				artifactId: 'a',
				contentVersion: 2,
				sectionStatus: 'draft'
			});
		const auto = new SectionAutosave({
			debounceMs: 100,
			maxIntervalMs: 15000,
			save,
			buildFile: async () => new File([1 as never], 'x.docx'),
			onSaved: () => {},
			onStale: () => {}
		});

		// First edit → debounce elapses → save begins (in flight, unresolved).
		auto.markDirty();
		await vi.advanceTimersByTimeAsync(150);
		expect(save).toHaveBeenCalledTimes(1);
		expect(auto.state).toBe('saving');

		// A second edit lands while that save is still in flight — it isn't part
		// of the snapshot the first save already sent, so it must be re-armed.
		auto.markDirty();

		// Let the first save resolve, then let the follow-up debounce elapse.
		resolveFirstSave({
			status: 'saved',
			artifactId: 'a',
			contentVersion: 1,
			sectionStatus: 'draft'
		});
		await vi.advanceTimersByTimeAsync(150);

		expect(save).toHaveBeenCalledTimes(2);
		expect(auto.state).toBe('idle');
		auto.dispose();
	});

	it('langit-langit interval: save dipaksa meski debounce terus di-reset', async () => {
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

		// Keep re-arming the debounce every 1s (well under the 2s debounce), so a
		// pure rolling-debounce implementation would never fire — but the 15s
		// ceiling must force a save once total dirty time crosses maxIntervalMs.
		for (let i = 0; i < 20; i++) {
			auto.markDirty();
			await vi.advanceTimersByTimeAsync(1000);
		}

		expect(save).toHaveBeenCalledTimes(1);
		auto.dispose();
	});

	it('dispose membatalkan save yang masih pending', async () => {
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
		auto.dispose();
		await vi.advanceTimersByTimeAsync(5000);

		expect(save).not.toHaveBeenCalled();
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
