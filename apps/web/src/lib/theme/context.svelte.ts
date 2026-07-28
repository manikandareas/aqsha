import { mode, userPrefersMode, setMode, toggleMode, resetMode } from 'mode-watcher';
import { createContext } from '$lib/context';

/** Theme preference union — mode-watcher doesn't export `Mode` from its public entry,
 *  so declared here to avoid a deep import. */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Theme control seam. Wraps mode-watcher's browser-local theme API so the appearance toggle and
 * any theme-aware UI depend on our boundary, not the library directly.
 *
 * mode-watcher's `mode`/`userPrefersMode` are module-level reactive stores. Unlike auth/user state
 * (banned at module scope for SSR cross-user leakage), theme is browser-local (localStorage,
 * per-device) and NOT request-scoped: during SSR it is simply undefined until the client hydrates,
 * so it cannot leak between users.
 */
export class ThemeState {
	/** Resolved active mode ('light' | 'dark'); `undefined` during SSR / before hydration. */
	get mode(): 'light' | 'dark' | undefined {
		return mode.current;
	}

	/** The user's stored preference ('light' | 'dark' | 'system'). */
	get preference(): ThemeMode {
		return userPrefersMode.current;
	}

	/** Set the preference; `'system'` resumes following the OS. */
	setMode(next: ThemeMode): void {
		setMode(next);
	}

	/** Flip between light and dark (used by the header toggle). */
	toggle(): void {
		toggleMode();
	}

	/** Reset back to following the operating system preference. */
	reset(): void {
		resetMode();
	}
}

export const themeContext = createContext<ThemeState>('theme');
