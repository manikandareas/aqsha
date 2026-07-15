import { createContext } from '$lib/context';

// Follow-bottom / scroll-anchoring engine. Follows the transcript bottom as content streams in,
// UNLESS the user has scrolled up; a floating button reappears while not at bottom. No virtualization —
// that would change scroll behavior. Reduced-motion → instant jumps.
//
// A class with `$state` (not module-level mutable state); the scroller/content elements are wired via
// `{@attach}` (sync external DOM with cleanup, NOT `$effect` reflex). Exposes `isAtBottom` +
// `scrollToBottom()` via context for the scroll button.

/** Distance (px) from the bottom still counted as "at bottom". */
const BOTTOM_THRESHOLD = 24;

export class StickToBottom {
	/** Reactive: is the viewport currently pinned to the bottom? Drives the scroll button. */
	isAtBottom = $state(true);

	#scroller: HTMLElement | null = null;
	/** Follow the bottom on content growth until the user scrolls up; re-armed when they return. */
	#follow = true;
	#reducedMotion = false;
	/** Suppress the scroll handler while WE are programmatically scrolling. */
	#programmatic = false;

	#behavior(smooth: boolean): ScrollBehavior {
		return smooth && !this.#reducedMotion ? 'smooth' : 'auto';
	}

	#measure(): void {
		const el = this.#scroller;
		if (!el) return;
		this.isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
	}

	/** Programmatically pin to the bottom (used on mount, on content growth, and by the button). */
	scrollToBottom(smooth = true): void {
		const el = this.#scroller;
		if (!el) return;
		this.#follow = true;
		this.#programmatic = true;
		el.scrollTo({ top: el.scrollHeight, behavior: this.#behavior(smooth) });
		// Clear the programmatic flag after the (async) scroll settles.
		setTimeout(() => {
			this.#programmatic = false;
			this.#measure();
		}, 60);
	}

	/** `{@attach}` for the scroll container. Wires scroll tracking + reduced-motion; returns cleanup. */
	attachScroller = (el: HTMLElement): (() => void) => {
		this.#scroller = el;
		const mq =
			typeof window !== 'undefined' && window.matchMedia
				? window.matchMedia('(prefers-reduced-motion: reduce)')
				: null;
		this.#reducedMotion = mq?.matches ?? false;
		const onMotion = (e: MediaQueryListEvent) => (this.#reducedMotion = e.matches);
		mq?.addEventListener('change', onMotion);

		const onScroll = () => {
			if (this.#programmatic) return; // ignore our own programmatic scroll
			this.#measure();
			// User scrolled up → stop following; scrolled back to the bottom → re-arm follow.
			this.#follow = this.isAtBottom;
		};
		el.addEventListener('scroll', onScroll, { passive: true });

		// Initial pin: instant on first paint to avoid a visible jump.
		this.scrollToBottom(false);

		return () => {
			el.removeEventListener('scroll', onScroll);
			mq?.removeEventListener('change', onMotion);
			this.#scroller = null;
		};
	};

	/** `{@attach}` for the inner content. Follows the bottom as the content grows. */
	attachContent = (el: HTMLElement): (() => void) => {
		const ro =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						if (this.#follow) this.scrollToBottom(true);
						else this.#measure();
					})
				: null;
		ro?.observe(el);
		return () => ro?.disconnect();
	};
}

/** Per-tree context — the scroll button reads `isAtBottom` and `scrollToBottom()`. */
export const stickToBottomContext = createContext<StickToBottom>('stick-to-bottom');
export const getStickToBottom = (): StickToBottom => stickToBottomContext.get();
