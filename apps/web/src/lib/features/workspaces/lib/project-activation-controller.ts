import type { ProjectActivationEvent } from './project-activation';

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining(): number };

type ActivationEnvironment = {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(id: number): void;
	requestIdleCallback?: (
		callback: (deadline: IdleDeadlineLike) => void,
		options?: { timeout: number }
	) => number;
	cancelIdleCallback?: (id: number) => void;
	setTimeout(callback: () => void, delay: number): number;
	clearTimeout(id: number): void;
	observe(node: HTMLElement, onResize: () => void): () => void;
};

function browserEnvironment(): ActivationEnvironment {
	return {
		requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
		cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
		requestIdleCallback: window.requestIdleCallback?.bind(window),
		cancelIdleCallback: window.cancelIdleCallback?.bind(window),
		setTimeout: (callback, delay) => window.setTimeout(callback, delay),
		clearTimeout: (id) => window.clearTimeout(id),
		observe(node, onResize) {
			const observer = new ResizeObserver(onResize);
			observer.observe(node);
			return () => observer.disconnect();
		}
	};
}

export class ProjectActivationController {
	#dispatch: (event: ProjectActivationEvent) => void;
	#environment: ActivationEnvironment | null;
	#frameId: number | null = null;
	#idleId: number | null = null;
	#timerId: number | null = null;
	#painted = false;
	#activated = false;
	#wide = false;
	#disposeObservation: (() => void) | null = null;

	constructor(
		dispatch: (event: ProjectActivationEvent) => void,
		environment: ActivationEnvironment | null = null
	) {
		this.#dispatch = dispatch;
		this.#environment = environment;
	}

	attach(node: HTMLElement): () => void {
		const environment = (this.#environment ??= browserEnvironment());
		this.dispose();
		const measure = () => {
			this.#wide = node.clientWidth >= 900;
			this.#dispatch({ type: 'layout-measured', wide: this.#wide });
			if (this.#wide && this.#painted) this.#scheduleIdle();
			if (!this.#wide) this.#cancelIdle();
		};

		measure();
		this.#disposeObservation = environment.observe(node, measure);
		this.#frameId = environment.requestAnimationFrame(() => {
			this.#frameId = null;
			this.#painted = true;
			this.#dispatch({ type: 'shell-painted' });
			if (this.#wide) this.#scheduleIdle();
		});

		return () => this.dispose();
	}

	activateNow(): void {
		if (this.#activated) return;
		this.#activated = true;
		this.#cancelIdle();
		this.#dispatch({ type: 'open-document-surface' });
	}

	dispose(): void {
		if (this.#frameId !== null) this.#environment?.cancelAnimationFrame(this.#frameId);
		this.#frameId = null;
		this.#cancelIdle();
		this.#disposeObservation?.();
		this.#disposeObservation = null;
	}

	#scheduleIdle(): void {
		if (this.#activated || this.#idleId !== null || this.#timerId !== null) return;
		const environment = this.#environment;
		if (!environment) return;
		const activate = () => {
			this.#idleId = null;
			this.#timerId = null;
			if (this.#activated || !this.#wide) return;
			this.#activated = true;
			this.#dispatch({ type: 'desktop-delay-complete' });
		};

		if (environment.requestIdleCallback) {
			this.#idleId = environment.requestIdleCallback(activate, { timeout: 1500 });
		} else {
			this.#timerId = environment.setTimeout(activate, 1500);
		}
	}

	#cancelIdle(): void {
		if (this.#idleId !== null) this.#environment?.cancelIdleCallback?.(this.#idleId);
		if (this.#timerId !== null) this.#environment?.clearTimeout(this.#timerId);
		this.#idleId = null;
		this.#timerId = null;
	}
}
