import { prefersReducedMotion } from 'svelte/motion';
import { createContext } from '$lib/context';

/**
 * Motion seam. Svelte has built-in transitions/animate, so there is no lazy runtime to load; this
 * seam instead centralizes the reduced-motion signal so components read one boundary.
 * `prefersReducedMotion` (svelte/motion) is a browser-local reactive `MediaQuery` — like theme, it
 * is per-device and not request-scoped, so exposing it here does not leak across SSR users.
 */
export class MotionState {
	/** True when the OS requests reduced motion; drives conditional transitions. */
	get reducedMotion(): boolean {
		return prefersReducedMotion.current;
	}
}

export const motionContext = createContext<MotionState>('motion');
