import { useClerkContext } from 'svelte-clerk';
import { createContext } from '$lib/context';
import {
	resolveViewer,
	viewerDisplay,
	type ViewerDisplay,
	type ViewerIdentity
} from './viewer-identity';

/**
 * State viewer reaktif per-request (plan §3.5 — class `$state` + context, TANPA module-level mutable
 * state → tak bocor lintas user saat SSR). Logika resolve/display pure di `viewer-identity.ts`.
 * Konstruksi dalam komponen child `<ClerkProvider>` (mis. `AppProviders`) — `useClerkContext()`
 * membaca context. `resolved`/`display` reaktif terhadap user Clerk (login/avatar) tanpa `$effect`.
 */
export class ViewerIdentityState {
	#clerk = useClerkContext();
	/** Viewer dari API (server-provided). Boleh di-set ulang saat data profil termuat. */
	base = $state<ViewerIdentity | undefined>(undefined);

	constructor(base?: ViewerIdentity) {
		this.base = base;
	}

	get resolved(): ViewerIdentity | undefined {
		return resolveViewer(this.base, this.#clerk.user);
	}

	display(fallback: { name: string; email: string }): ViewerDisplay {
		return viewerDisplay(this.base, this.#clerk.user, fallback);
	}
}

export const viewerContext = createContext<ViewerIdentityState>('viewer-identity');
