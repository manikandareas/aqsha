import type { AnnotationDraft } from './annotation-selection';
import {
	blockToDraft,
	buildBlockIndex,
	hitTestBlock,
	type SemanticBlock
} from './annotation-hover-targets';

export type StagePoint = { x: number; y: number };

type AgentationDeps = {
	svgHost: () => HTMLElement | null;
	stageEl: () => HTMLElement | null;
	outlineTitles: () => string[];
	onCreate: (draft: AnnotationDraft, note: string, elementLabel: string) => void;
};

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
	note = $state('');

	#index: SemanticBlock[] | null = null;
	#raf = 0;

	#deps: AgentationDeps;

	constructor(deps: AgentationDeps) {
		this.#deps = deps;
	}

	toggle(): void {
		this.enabled = !this.enabled;
		if (!this.enabled) {
			this.hover = null;
			this.closeComposer();
		}
	}

	/** Panggil saat SVG di-render ulang / zoom / resize — geometri fragmen berubah. */
	invalidateIndex(): void {
		this.#index = null;
		this.hover = null;
	}

	onPointerMove(event: PointerEvent): void {
		if (!this.enabled || this.composer) return;
		if ((event.target as Element | null)?.closest?.('[data-annotation-ui]')) return;
		const { clientX, clientY } = event;
		if (this.#raf) return;
		this.#raf = requestAnimationFrame(() => {
			this.#raf = 0;
			this.#updateHover(clientX, clientY);
		});
	}

	onPointerLeave(): void {
		if (this.#raf) {
			cancelAnimationFrame(this.#raf);
			this.#raf = 0;
		}
		this.hover = null;
	}

	/** Klik dokumen saat mode aktif → buka popover di titik klik blok ter-hover. */
	onStageClick(event: MouseEvent): void {
		if (!this.enabled) return;
		if ((event.target as Element | null)?.closest?.('[data-annotation-ui]')) return;
		event.preventDefault();
		event.stopPropagation();
		if (this.composer) {
			this.closeComposer();
			return;
		}
		const svgHost = this.#deps.svgHost();
		const stageEl = this.#deps.stageEl();
		if (!svgHost || !stageEl) return;
		const block = hitTestBlock(this.#ensureIndex(svgHost), svgHost, event.clientX, event.clientY);
		if (!block) return;
		this.hover = null;
		this.composer = { block, anchor: this.#toStagePoint(stageEl, event.clientX, event.clientY) };
		this.note = '';
	}

	closeComposer(): void {
		this.composer = null;
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
	}

	#ensureIndex(svgHost: HTMLElement): SemanticBlock[] {
		this.#index ??= buildBlockIndex(svgHost, this.#deps.outlineTitles());
		return this.#index;
	}

	#toStagePoint(stageEl: HTMLElement, clientX: number, clientY: number): StagePoint {
		const box = stageEl.getBoundingClientRect();
		return { x: clientX - box.left, y: clientY - box.top };
	}

	#updateHover(clientX: number, clientY: number): void {
		if (!this.enabled || this.composer) return;
		const svgHost = this.#deps.svgHost();
		const stageEl = this.#deps.stageEl();
		if (!svgHost || !stageEl) return;
		const block = hitTestBlock(this.#ensureIndex(svgHost), svgHost, clientX, clientY);
		this.hover = block ? { block, cursor: this.#toStagePoint(stageEl, clientX, clientY) } : null;
	}
}
