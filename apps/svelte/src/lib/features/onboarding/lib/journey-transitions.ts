// Shared step-swap motion for the onboarding journey: the incoming page settles down into place
// while the outgoing one lifts away, both with a light focus-pull blur. Direction-aware so back
// navigation reads as returning, not advancing. Reduced motion collapses to an instant swap.

import { quartOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

type PageMotion = { direction?: 1 | -1; reduce?: boolean };

export function pageEnter(
	_node: Element,
	{ direction = 1, reduce = false }: PageMotion = {}
): TransitionConfig {
	if (reduce) return { duration: 0 };
	return {
		duration: 320,
		easing: quartOut,
		css: (t, u) =>
			`opacity:${t}; transform: translateY(${18 * direction * u}px); filter: blur(${3 * u}px);`
	};
}

export function pageExit(
	_node: Element,
	{ direction = 1, reduce = false }: PageMotion = {}
): TransitionConfig {
	if (reduce) return { duration: 0, css: () => 'opacity: 1' };
	return {
		duration: 200,
		easing: quartOut,
		css: (t, u) =>
			`opacity:${t}; transform: translateY(${-14 * direction * u}px); filter: blur(${2 * u}px);`
	};
}
