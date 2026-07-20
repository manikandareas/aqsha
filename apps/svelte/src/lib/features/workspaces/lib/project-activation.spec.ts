import { describe, expect, it } from 'vitest';
import { initialProjectActivation, reduceProjectActivation } from './project-activation';

describe('project document activation policy', () => {
	it('activates the desktop document runtime only after shell paint and the scheduled frame', () => {
		let state = initialProjectActivation();
		state = reduceProjectActivation(state, { type: 'layout-measured', wide: true });
		expect(state.documentRuntimeActive).toBe(false);

		state = reduceProjectActivation(state, { type: 'shell-painted' });
		expect(state.documentRuntimeActive).toBe(false);

		state = reduceProjectActivation(state, { type: 'desktop-delay-complete' });
		expect(state.documentRuntimeActive).toBe(true);
	});

	it('keeps mobile chat free of document runtime until editor or preview is selected', () => {
		let state = reduceProjectActivation(initialProjectActivation(), {
			type: 'layout-measured',
			wide: false
		});
		state = reduceProjectActivation(state, { type: 'shell-painted' });
		state = reduceProjectActivation(state, { type: 'desktop-delay-complete' });
		expect(state.documentRuntimeActive).toBe(false);

		state = reduceProjectActivation(state, { type: 'open-document-surface' });
		expect(state.documentRuntimeActive).toBe(true);
	});

	it('lets user intent activate immediately before the desktop delay completes', () => {
		let state = reduceProjectActivation(initialProjectActivation(), {
			type: 'layout-measured',
			wide: true
		});
		state = reduceProjectActivation(state, { type: 'shell-painted' });
		state = reduceProjectActivation(state, { type: 'open-document-surface' });

		expect(state.documentRuntimeActive).toBe(true);
		expect(state.desktopActivationPending).toBe(false);
	});

	// Referensi identik saat event tak mengubah state — dipakai `$state.raw` supaya dispatch
	// berulang (mis. ResizeObserver) tidak memicu effect berantai tanpa perlu.
	it('returns the same reference when an event changes nothing', () => {
		let state = reduceProjectActivation(initialProjectActivation(), {
			type: 'layout-measured',
			wide: true
		});
		expect(reduceProjectActivation(state, { type: 'layout-measured', wide: true })).toBe(state);

		state = reduceProjectActivation(state, { type: 'shell-painted' });
		expect(reduceProjectActivation(state, { type: 'shell-painted' })).toBe(state);

		state = reduceProjectActivation(state, { type: 'desktop-delay-complete' });
		expect(reduceProjectActivation(state, { type: 'desktop-delay-complete' })).toBe(state);
		expect(reduceProjectActivation(state, { type: 'open-document-surface' })).toBe(state);
	});
});
