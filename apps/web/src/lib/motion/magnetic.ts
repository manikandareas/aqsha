import { prefersReducedMotion } from 'svelte/motion';
import type { Attachment } from 'svelte/attachments';

/**
 * `magnetic` — elemen bergeser ke arah kursor selama dalam `radius`, lalu balik ke rest saat kursor
 * keluar. Transisi CSS transform (bukan spring). No-op saat reduced-motion.
 */
export function magnetic(
	options: { radius?: number; strength?: number } = {}
): Attachment<HTMLElement> {
	const { radius = 120, strength = 0.35 } = options;
	return (node) => {
		if (prefersReducedMotion.current) return;
		node.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
		node.style.willChange = 'transform';

		const onMove = (event: MouseEvent) => {
			const rect = node.getBoundingClientRect();
			const dx = event.clientX - (rect.left + rect.width / 2);
			const dy = event.clientY - (rect.top + rect.height / 2);
			if (Math.hypot(dx, dy) > radius) {
				node.style.transform = 'translate(0px, 0px)';
				return;
			}
			node.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
		};
		const onLeave = () => {
			node.style.transform = 'translate(0px, 0px)';
		};

		window.addEventListener('mousemove', onMove, { passive: true });
		node.addEventListener('mouseleave', onLeave);
		return () => {
			window.removeEventListener('mousemove', onMove);
			node.removeEventListener('mouseleave', onLeave);
		};
	};
}
