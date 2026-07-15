import { prefersReducedMotion } from 'svelte/motion';
import type { Attachment } from 'svelte/attachments';

/**
 * `reveal` — IntersectionObserver menandai `data-inview` saat elemen masuk viewport → kelas Tailwind
 * `data-[inview]:*` melakukan transisi masuk. Reduced-motion / no-JS: elemen langsung terlihat
 * (varian `motion-reduce:*` + set `data-inview` segera). `once` default true.
 *
 * Dipakai `{@attach reveal()}` pada elemen ber-kelas preset `revealUp`/`revealFade`.
 */
export function reveal(
	options: { once?: boolean; rootMargin?: string } = {}
): Attachment<HTMLElement> {
	const { once = true, rootMargin = '0px 0px -10% 0px' } = options;
	return (node) => {
		if (prefersReducedMotion.current) {
			node.setAttribute('data-inview', '');
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						node.setAttribute('data-inview', '');
						if (once) io.unobserve(node);
					} else if (!once) {
						node.removeAttribute('data-inview');
					}
				}
			},
			{ rootMargin, threshold: 0 }
		);
		io.observe(node);
		return () => io.disconnect();
	};
}

// Preset kelas (didefinisikan sebagai string literal supaya scanner Tailwind v4 memindainya dari .ts).
// `revealUp` = fade + rise; `revealFade` = fade saja.
export const revealUp =
	'translate-y-5 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] data-[inview]:translate-y-0 data-[inview]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none';

export const revealFade =
	'opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] data-[inview]:opacity-100 motion-reduce:opacity-100 motion-reduce:transition-none';
