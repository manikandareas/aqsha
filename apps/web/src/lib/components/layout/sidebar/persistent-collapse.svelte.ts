import { browser } from '$app/environment';

/**
 * Persisted collapse state for a sidebar section. Backed by `localStorage[storageKey]` ("1"/"0") +
 * a window `storage` event and a custom broadcast so multiple sections (and tabs) stay in sync.
 * Call during component init.
 */
export const SIDEBAR_SECTION_EVENT = 'aqsha:sidebar-section-toggle';

export type PersistentCollapse = {
	readonly collapsed: boolean;
	toggle: () => void;
};

export function createPersistentCollapse(
	storageKey: string | undefined,
	defaultCollapsed = false
): PersistentCollapse {
	const read = () => {
		if (!browser || !storageKey) return defaultCollapsed;
		const stored = window.localStorage.getItem(storageKey);
		return stored === null ? defaultCollapsed : stored === '1';
	};

	let collapsed = $state(read());

	$effect(() => {
		if (!browser || !storageKey) return;
		const sync = () => {
			collapsed = read();
		};
		window.addEventListener('storage', sync);
		window.addEventListener(SIDEBAR_SECTION_EVENT, sync);
		return () => {
			window.removeEventListener('storage', sync);
			window.removeEventListener(SIDEBAR_SECTION_EVENT, sync);
		};
	});

	return {
		get collapsed() {
			return collapsed;
		},
		toggle() {
			if (!browser || !storageKey) return;
			const next = window.localStorage.getItem(storageKey) === '1' ? '0' : '1';
			window.localStorage.setItem(storageKey, next);
			window.dispatchEvent(new Event(SIDEBAR_SECTION_EVENT));
			collapsed = next === '1';
		}
	};
}
