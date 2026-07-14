import { useClerkContext, type ClerkContext } from 'svelte-clerk';
import { clerkTokenGetter, type TokenGetter } from './token';
import { runWithReverification } from './reverification';

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

/**
 * Reactive `{ isLoaded, user }` facade — padanan web `useUser()` (svelte-clerk ships no such
 * hook). The `user` is the clerk-js `UserResource` (`passwordEnabled`/`totpEnabled`/
 * `updatePassword`/`createTOTP`/… ) used by the security panels (Phase 5). Getters, so reads in a
 * reactive scope re-run as clerk-js loads/refreshes the user.
 */
export function getClerkUser(): {
	readonly isLoaded: boolean;
	readonly user: ClerkContext['user'];
} {
	const ctx = useClerkContext();
	return {
		get isLoaded() {
			return ctx.isLoaded;
		},
		get user() {
			return ctx.user;
		}
	};
}

/**
 * Returns a stable `signOut(opts?)` bound to the current clerk context. Captures the context at
 * init and reads `ctx.clerk` FRESH on each call — so it is safe to call from an event handler
 * (unlike `getClerk()`, whose underlying `useClerkContext()`/`getContext()` may only run during
 * component init) and never holds a stale (null-at-mount) clerk reference.
 */
export function getSignOut(): (opts?: { redirectUrl?: string }) => Promise<void> {
	const ctx = useClerkContext();
	return async (opts) => {
		await ctx.clerk?.signOut(opts);
	};
}

/**
 * Returns a `reverify(op)` runner that wraps a sensitive clerk-js call in Clerk's step-up
 * reverification flow (padanan web `useReverification`). Captures the clerk context here (init
 * scope) and reads `ctx.clerk` fresh on each call, so a not-yet-loaded clerk at mount still uses
 * the loaded instance when the user actually triggers the action.
 */
export function getReverification(): <T>(op: () => Promise<T>) => Promise<T> {
	const ctx = useClerkContext();
	return (op) => runWithReverification(ctx.clerk, op);
}
