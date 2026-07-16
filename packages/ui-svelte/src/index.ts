// Prefer the per-component subpaths (`@aqsha/ui-svelte/components/button`) so
// consumers only compile what they use; this barrel exists for tooling that
// resolves the package root.
export { cn } from './utils.js';
export type {
	WithoutChild,
	WithoutChildren,
	WithoutChildrenOrChild,
	WithElementRef
} from './utils.js';
