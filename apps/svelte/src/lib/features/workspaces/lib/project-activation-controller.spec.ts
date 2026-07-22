import { describe, expect, it, vi } from 'vitest';
import { ProjectActivationController } from './project-activation-controller';
import type { ProjectActivationEvent } from './project-activation';

function harness(width: number, idleSupported = true) {
	const events: ProjectActivationEvent[] = [];
	const frames = new Map<number, FrameRequestCallback>();
	const idles = new Map<number, IdleRequestCallback>();
	const timers = new Map<number, () => void>();
	let nextId = 1;
	let resize: (() => void) | null = null;
	const disconnect = vi.fn();
	const node = { clientWidth: width } as HTMLElement;
	const controller = new ProjectActivationController((event) => events.push(event), {
		requestAnimationFrame(callback) {
			const id = nextId++;
			frames.set(id, callback);
			return id;
		},
		cancelAnimationFrame: (id) => frames.delete(id),
		requestIdleCallback: idleSupported
			? (callback) => {
					const id = nextId++;
					idles.set(id, callback);
					return id;
				}
			: undefined,
		cancelIdleCallback: idleSupported ? (id) => idles.delete(id) : undefined,
		setTimeout(callback) {
			const id = nextId++;
			timers.set(id, callback);
			return id;
		},
		clearTimeout: (id) => timers.delete(id),
		observe(_node, callback) {
			resize = callback;
			return disconnect;
		}
	});

	return { controller, disconnect, events, frames, idles, node, resize: () => resize?.(), timers };
}

describe('ProjectActivationController', () => {
	it('dapat dibuat saat SSR tanpa mengakses browser globals', () => {
		expect(() => new ProjectActivationController(() => {})).not.toThrow();
	});

	it('mengaktifkan desktop melalui idle callback setelah first paint', () => {
		const h = harness(1200);
		const dispose = h.controller.attach(h.node);

		expect(h.events).toEqual([{ type: 'layout-measured', wide: true }]);
		const frame = [...h.frames.values()][0];
		frame?.(0);
		expect(h.events.at(-1)).toEqual({ type: 'shell-painted' });
		const idle = [...h.idles.values()][0];
		idle?.({ didTimeout: false, timeRemaining: () => 10 });
		expect(h.events.at(-1)).toEqual({ type: 'desktop-delay-complete' });

		dispose();
		expect(h.disconnect).toHaveBeenCalledOnce();
	});

	it('memprioritaskan intent dan membatalkan idle yang tertunda', () => {
		const h = harness(1200);
		h.controller.attach(h.node);
		[...h.frames.values()][0]?.(0);

		h.controller.activateNow();
		expect(h.idles.size).toBe(0);
		expect(h.events.at(-1)).toEqual({ type: 'open-document-surface' });
	});

	it('tidak menjadwalkan engine pada mobile', () => {
		const h = harness(600);
		h.controller.attach(h.node);
		[...h.frames.values()][0]?.(0);

		expect(h.idles.size).toBe(0);
		expect(h.timers.size).toBe(0);
		expect(h.events).not.toContainEqual({ type: 'desktop-delay-complete' });
	});

	it('memakai timer fallback dan membersihkannya saat unmount', () => {
		const h = harness(1200, false);
		const dispose = h.controller.attach(h.node);
		[...h.frames.values()][0]?.(0);
		expect(h.timers.size).toBe(1);

		dispose();
		expect(h.timers.size).toBe(0);
	});
});
