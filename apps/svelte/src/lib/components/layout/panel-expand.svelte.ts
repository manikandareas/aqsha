import { createContext } from '$lib/context';

/**
 * Panel width control (normal vs expanded 30:70 split), provided by `DetailSplitLayout`
 * and consumed by `PanelExpandButton`. Padanan web `PanelExpandContext`. `getOptional()`
 * returns undefined outside a `DetailSplitLayout` (expand button then renders nothing).
 *
 * `canExpand`/`expanded` are exposed as getters so the provider can back them with
 * reactive `$state`/`$derived` while the context value reference stays stable.
 */
export type PanelExpandValue = {
	/** Expand only applies while the panel docks inline (desktop). */
	readonly canExpand: boolean;
	readonly expanded: boolean;
	setExpanded: (expanded: boolean) => void;
};

export const panelExpandContext = createContext<PanelExpandValue>('panel-expand');
