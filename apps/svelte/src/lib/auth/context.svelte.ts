import { useClerkContext, type ClerkContext } from 'svelte-clerk';
import { clerkTokenGetter, type TokenGetter } from './token';

/**
 * Auth facade sisi CLIENT (plan §Phase 2 task 2). Feature code memakai facade ini, BUKAN
 * `svelte-clerk` mentah — supaya API package auth tak tersebar & gotcha Phase 1 ter-bake:
 *
 *  - Gate di `isLoaded`, bukan `userId` (temuan a): `userId` datang instan dari SSR `initialState`,
 *    tapi `session.getToken()` masih `null` sampai clerk-js load → firing lebih awal = 401 tokenless.
 *    `isSignedIn` sudah menggabung `isLoaded && userId`.
 *  - Consumer yang bikin `$effect` WAJIB depend PRIMITIF, mis. `const userId = $derived(auth.userId)`
 *    (temuan b): membaca objek `clerk.auth` langsung di `$effect` bikin re-run tiap churn token →
 *    state ke-destroy mid-stream.
 *
 * Getter (bukan snapshot) → reaktif: dibaca ulang tiap akses dalam scope reaktif.
 */
export type AuthState = {
	readonly isLoaded: boolean;
	readonly userId: string | null;
	readonly sessionId: string | null;
	readonly isSignedIn: boolean;
};

export function getAuthState(): AuthState {
	const ctx = useClerkContext();
	return {
		get isLoaded() {
			return ctx.isLoaded;
		},
		get userId() {
			return ctx.auth.userId ?? null;
		},
		get sessionId() {
			return ctx.auth.sessionId ?? null;
		},
		get isSignedIn() {
			return ctx.isLoaded && Boolean(ctx.auth.userId);
		}
	};
}

/**
 * Token getter Clerk per-request untuk Eden/Mastra dari client. Baca `session` di CALL TIME → selalu
 * token segar (bukan captured/stale). Padanan sisi server = `getServerToken` di `$lib/server/auth`.
 */
export function getAuthToken(): TokenGetter {
	return clerkTokenGetter(useClerkContext());
}

/**
 * Handle clerk-js low-level (reverification, 2FA, sign-out, session). Seam tunggal untuk flow Clerk
 * lanjutan (settings/security = Phase 5) tanpa menyebar `useClerkContext` ke feature. Reaktif: baca
 * di scope reaktif untuk melihat perubahan `isLoaded`.
 */
export function getClerk(): ClerkContext['clerk'] {
	return useClerkContext().clerk;
}
