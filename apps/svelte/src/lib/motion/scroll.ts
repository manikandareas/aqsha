import { prefersReducedMotion } from 'svelte/motion';
import type { Attachment } from 'svelte/attachments';
import { computeScrollProgress, type ScrollOffset } from './scroll-math';

/**
 * Scroll-linked progress attach — padanan `useScroll({target, offset})` framer yang dipakai
 * `apps/web/features/marketing/**`. Math pure ada di `scroll-math.ts` (contract-testable di node);
 * di sini hanya wiring listener + reduced-motion guard.
 */
export { computeScrollProgress, mapRange, type ScrollOffset } from './scroll-math';

/**
 * Attach: lapor progress scroll elemen ke `cb` (rAF-throttled). No-op saat reduced-motion (komponen
 * memakai state natural). Dipakai `{@attach scrollProgress(offset, (p) => (progress = p))}`.
 */
export function scrollProgress(
	offset: ScrollOffset,
	cb: (progress: number) => void
): Attachment<HTMLElement> {
	return (node) => {
		if (prefersReducedMotion.current) return;
		let raf = 0;
		const update = () => {
			raf = 0;
			cb(computeScrollProgress(node.getBoundingClientRect(), window.innerHeight, offset));
		};
		const onScroll = () => {
			if (!raf) raf = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	};
}
