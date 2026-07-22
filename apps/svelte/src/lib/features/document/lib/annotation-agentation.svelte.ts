import type { AnnotationDraft } from './annotation-selection';
import {
	blockToDraft,
	buildBlockIndex,
	hitTestBlock,
	type SemanticBlock,
	type SemanticRangeResult
} from './annotation-hover-targets';

export type StagePoint = { x: number; y: number };

type AgentationDeps = {
	svgHost: () => HTMLElement | null;
	stageEl: () => HTMLElement | null;
	outlineTitles: () => string[];
	resolveBlock?: (
		svgHost: HTMLElement,
		target: EventTarget | null,
		clientX: number,
		clientY: number
	) => Promise<SemanticBlock | null>;
	resolveRange?: (
		svgHost: HTMLElement,
		start: SemanticBlock,
		end: SemanticBlock,
		legacyBlocks: SemanticBlock[]
	) => SemanticRangeResult;
	resolveAreaRange?: (
		svgHost: HTMLElement,
		start: { clientX: number; clientY: number },
		end: { clientX: number; clientY: number },
		legacyBlocks: SemanticBlock[]
	) => Promise<SemanticRangeResult | null>;
	onCreate: (draft: AnnotationDraft, note: string, elementLabel: string) => void;
};

type PointerGesture = {
	pointerId: number;
	startX: number;
	startY: number;
	startBlock: Promise<SemanticBlock | null>;
};

type PendingDrag = {
	gesture: PointerGesture;
	target: EventTarget | null;
	clientX: number;
	clientY: number;
	version: number;
};

const DRAG_THRESHOLD_PX = 5;

/**
 * Mode anotasi ala agentation di atas preview Typst: hover blok semantik → outline + badge,
 * klik → popover komentar inline. Indeks blok mahal, jadi di-cache non-reaktif dan dibangun
 * lazy pada pointermove pertama setelah invalidasi (render/zoom/resize). Semua titik kursor
 * disimpan stage-relative supaya overlay ikut scroll/zoom tanpa reposition listener.
 */
export class AnnotationAgentation {
	enabled = $state(false);
	hover = $state.raw<{ block: SemanticBlock; cursor: StagePoint } | null>(null);
	composer = $state.raw<{ block: SemanticBlock; anchor: StagePoint } | null>(null);
	notice = $state.raw<{ message: string; cursor: StagePoint } | null>(null);
	dragBox = $state.raw<{ start: StagePoint; end: StagePoint } | null>(null);
	note = $state('');

	#index: SemanticBlock[] | null = null;
	#raf = 0;
	#resolveVersion = 0;
	#finalizeVersion = 0;
	#gesture: PointerGesture | null = null;
	#pendingDrag: PendingDrag | null = null;
	#dragResolveActive = false;
	#dragging = false;
	#finalizing = false;
	#suppressClick = false;
	#suppressClickTimer = 0;

	#deps: AgentationDeps;

	constructor(deps: AgentationDeps) {
		this.#deps = deps;
	}

	toggle(): void {
		this.setEnabled(!this.enabled);
	}

	setEnabled(next: boolean): void {
		if (this.enabled === next) return;
		this.enabled = next;
		if (!next) {
			this.hover = null;
			this.notice = null;
			this.#cancelGesture();
			this.closeComposer();
		}
	}

	/** Panggil saat SVG di-render ulang / zoom / resize — geometri fragmen berubah. */
	invalidateIndex(): void {
		this.#index = null;
		this.hover = null;
		this.notice = null;
		this.#cancelGesture();
	}

	onPointerDown(event: PointerEvent): void {
		if (!this.enabled || this.composer || event.button !== 0 || event.pointerType === 'touch')
			return;
		if ((event.target as Element | null)?.closest?.('[data-annotation-ui]')) return;
		const svgHost = this.#deps.svgHost();
		if (!svgHost) return;
		event.preventDefault();
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#pendingDrag = null;
		this.notice = null;
		this.dragBox = null;
		this.#finalizeVersion += 1;
		this.#finalizing = false;
		this.#resolveVersion += 1;
		this.#gesture = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startBlock: this.#resolveBlock(svgHost, event.target, event.clientX, event.clientY)
		};
		try {
			(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
		} catch {
			// Synthetic browser tests do not register an active native pointer.
		}
	}

	onPointerMove(event: PointerEvent): void {
		if (!this.enabled || this.composer || this.#finalizing) return;
		if ((event.target as Element | null)?.closest?.('[data-annotation-ui]')) return;
		const gesture = this.#gesture;
		if (gesture && gesture.pointerId === event.pointerId) {
			const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
			if (!this.#dragging && distance < DRAG_THRESHOLD_PX) return;
			this.#dragging = true;
			event.preventDefault();
			const stageEl = this.#deps.stageEl();
			if (stageEl) {
				this.dragBox = {
					start: this.#toStagePoint(stageEl, gesture.startX, gesture.startY),
					end: this.#toStagePoint(stageEl, event.clientX, event.clientY)
				};
			}
			const version = ++this.#resolveVersion;
			this.#pendingDrag = {
				gesture,
				target: event.target,
				clientX: event.clientX,
				clientY: event.clientY,
				version
			};
			this.#scheduleDragResolve();
			return;
		}
		const { clientX, clientY, target } = event;
		if (this.#raf) return;
		const version = ++this.#resolveVersion;
		this.#raf = requestAnimationFrame(() => {
			this.#raf = 0;
			void this.#updateHover(target, clientX, clientY, version);
		});
	}

	onPointerUp(event: PointerEvent): void {
		const gesture = this.#gesture;
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		event.preventDefault();
		this.#releasePointer(event);
		const wasDragging = this.#dragging;
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#pendingDrag = null;
		this.#gesture = null;
		this.#dragging = false;
		if (!wasDragging) return;
		this.#suppressNextClick();
		this.#resolveVersion += 1;
		this.#finalizing = true;
		const version = ++this.#finalizeVersion;
		void this.#finishDrag(gesture, event.target, event.clientX, event.clientY, version);
	}

	onPointerCancel(event: PointerEvent): void {
		if (this.#gesture?.pointerId !== event.pointerId) return;
		this.#releasePointer(event);
		this.#cancelGesture();
		this.hover = null;
		this.notice = null;
	}

	onPointerLeave(): void {
		if (this.#gesture || this.#finalizing) return;
		if (this.#raf) {
			cancelAnimationFrame(this.#raf);
			this.#raf = 0;
		}
		this.#resolveVersion += 1;
		this.hover = null;
	}

	/** Klik dokumen saat mode aktif → buka popover di titik klik blok ter-hover. */
	onStageClick(event: MouseEvent): void {
		if (!this.enabled) return;
		if (this.#suppressClick) {
			event.preventDefault();
			event.stopPropagation();
			this.#suppressClick = false;
			return;
		}
		if ((event.target as Element | null)?.closest?.('[data-annotation-ui]')) return;
		event.preventDefault();
		event.stopPropagation();
		if (this.composer) {
			this.closeComposer();
			return;
		}
		const version = ++this.#resolveVersion;
		void this.#openComposer(event.target, event.clientX, event.clientY, version);
	}

	closeComposer(): void {
		this.composer = null;
		this.notice = null;
		this.note = '';
	}

	submit(): void {
		const composer = this.composer;
		const note = this.note.trim();
		if (!composer || !note) return;
		this.#deps.onCreate(blockToDraft(composer.block), note, composer.block.kind);
		this.closeComposer();
	}

	dispose(): void {
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#resolveVersion += 1;
		this.#cancelGesture();
		if (this.#suppressClickTimer) window.clearTimeout(this.#suppressClickTimer);
		this.#suppressClickTimer = 0;
	}

	#ensureIndex(svgHost: HTMLElement): SemanticBlock[] {
		this.#index ??= buildBlockIndex(svgHost, this.#deps.outlineTitles());
		return this.#index;
	}

	#toStagePoint(stageEl: HTMLElement, clientX: number, clientY: number): StagePoint {
		const box = stageEl.getBoundingClientRect();
		return { x: clientX - box.left, y: clientY - box.top };
	}

	#cancelGesture(): void {
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#pendingDrag = null;
		this.#gesture = null;
		this.#dragging = false;
		this.#finalizing = false;
		this.dragBox = null;
		this.#resolveVersion += 1;
		this.#finalizeVersion += 1;
	}

	#releasePointer(event: PointerEvent): void {
		try {
			const target = event.currentTarget as Element | null;
			if (target?.hasPointerCapture?.(event.pointerId))
				target.releasePointerCapture(event.pointerId);
		} catch {
			// Pointer capture may already be released when the browser cancels the gesture.
		}
	}

	#suppressNextClick(): void {
		this.#suppressClick = true;
		if (this.#suppressClickTimer) window.clearTimeout(this.#suppressClickTimer);
		this.#suppressClickTimer = window.setTimeout(() => {
			this.#suppressClick = false;
			this.#suppressClickTimer = 0;
		}, 0);
	}

	#scheduleDragResolve(): void {
		if (this.#raf || this.#dragResolveActive || !this.#pendingDrag) return;
		this.#raf = requestAnimationFrame(() => {
			this.#raf = 0;
			void this.#drainPendingDrag();
		});
	}

	async #drainPendingDrag(): Promise<void> {
		const pending = this.#pendingDrag;
		if (!pending || this.#dragResolveActive) return;
		this.#pendingDrag = null;
		this.#dragResolveActive = true;
		try {
			await this.#updateDrag(
				pending.gesture,
				pending.target,
				pending.clientX,
				pending.clientY,
				pending.version
			);
		} catch {
			this.hover = null;
			this.notice = null;
		} finally {
			this.#dragResolveActive = false;
			this.#scheduleDragResolve();
		}
	}

	async #resolveBlock(
		svgHost: HTMLElement,
		target: EventTarget | null,
		clientX: number,
		clientY: number
	): Promise<SemanticBlock | null> {
		const indexed = hitTestBlock(this.#ensureIndex(svgHost), svgHost, clientX, clientY);
		if (indexed) return indexed;
		try {
			return (await this.#deps.resolveBlock?.(svgHost, target, clientX, clientY)) ?? null;
		} catch {
			return null;
		}
	}

	async #openComposer(
		target: EventTarget | null,
		clientX: number,
		clientY: number,
		version: number
	): Promise<void> {
		const svgHost = this.#deps.svgHost();
		const stageEl = this.#deps.stageEl();
		if (!svgHost || !stageEl) return;
		const block = await this.#resolveBlock(svgHost, target, clientX, clientY);
		if (version !== this.#resolveVersion || !this.enabled || this.composer || !block) return;
		this.hover = null;
		this.composer = { block, anchor: this.#toStagePoint(stageEl, clientX, clientY) };
		this.note = '';
	}

	#rangeResult(
		svgHost: HTMLElement,
		start: SemanticBlock,
		end: SemanticBlock
	): SemanticRangeResult {
		return (
			this.#deps.resolveRange?.(svgHost, start, end, this.#ensureIndex(svgHost)) ?? {
				ok: true,
				block: end
			}
		);
	}

	async #dragRangeResult(
		svgHost: HTMLElement,
		gesture: PointerGesture,
		target: EventTarget | null,
		clientX: number,
		clientY: number
	): Promise<SemanticRangeResult | null> {
		try {
			const legacyBlocks = this.#ensureIndex(svgHost);
			const areaResult = await this.#deps.resolveAreaRange?.(
				svgHost,
				{ clientX: gesture.startX, clientY: gesture.startY },
				{ clientX, clientY },
				legacyBlocks
			);
			if (areaResult) return areaResult;
			const [start, end] = await Promise.all([
				gesture.startBlock,
				this.#resolveBlock(svgHost, target, clientX, clientY)
			]);
			if (!start || !end) return null;
			return this.#rangeResult(svgHost, start, end);
		} catch {
			return { ok: false, reason: 'incompatible' };
		}
	}

	#showRangeFailure(
		reason: Exclude<SemanticRangeResult, { ok: true }>['reason'],
		cursor: StagePoint
	): void {
		const messages = {
			'different-page': 'Pilihan hanya dapat dibuat dalam satu halaman.',
			incompatible: 'Bagian ini tidak dapat digabungkan.'
		} as const;
		this.notice = { message: messages[reason], cursor };
	}

	async #updateDrag(
		gesture: PointerGesture,
		target: EventTarget | null,
		clientX: number,
		clientY: number,
		version: number
	): Promise<void> {
		const svgHost = this.#deps.svgHost();
		const stageEl = this.#deps.stageEl();
		if (!svgHost || !stageEl) return;
		const result = await this.#dragRangeResult(svgHost, gesture, target, clientX, clientY);
		if (version !== this.#resolveVersion || this.#gesture !== gesture || !result) return;
		const cursor = this.#toStagePoint(stageEl, clientX, clientY);
		if (!result.ok) {
			this.hover = null;
			this.#showRangeFailure(result.reason, cursor);
			return;
		}
		this.notice = null;
		this.hover = { block: result.block, cursor };
	}

	async #finishDrag(
		gesture: PointerGesture,
		target: EventTarget | null,
		clientX: number,
		clientY: number,
		version: number
	): Promise<void> {
		try {
			const svgHost = this.#deps.svgHost();
			const stageEl = this.#deps.stageEl();
			if (!svgHost || !stageEl) return;
			const result = await this.#dragRangeResult(svgHost, gesture, target, clientX, clientY);
			if (version !== this.#finalizeVersion || !this.enabled || this.composer) return;
			const anchor = this.#toStagePoint(stageEl, clientX, clientY);
			if (!result) {
				this.hover = null;
				this.notice = null;
				return;
			}
			if (!result.ok) {
				this.hover = null;
				this.#showRangeFailure(result.reason, anchor);
				return;
			}
			this.hover = null;
			this.notice = null;
			this.composer = { block: result.block, anchor };
			this.note = '';
		} finally {
			if (version === this.#finalizeVersion) {
				this.#finalizing = false;
				this.dragBox = null;
			}
		}
	}

	async #updateHover(
		target: EventTarget | null,
		clientX: number,
		clientY: number,
		version: number
	): Promise<void> {
		if (!this.enabled || this.composer) return;
		const svgHost = this.#deps.svgHost();
		const stageEl = this.#deps.stageEl();
		if (!svgHost || !stageEl) return;
		const block = await this.#resolveBlock(svgHost, target, clientX, clientY);
		if (version !== this.#resolveVersion || !this.enabled || this.composer) return;
		this.notice = null;
		this.hover = block ? { block, cursor: this.#toStagePoint(stageEl, clientX, clientY) } : null;
	}
}
