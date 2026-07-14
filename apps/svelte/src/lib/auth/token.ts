import type { ClerkContext } from 'svelte-clerk';

/** Token getter contract shared by the Eden and Mastra clients (mirror `@aqsha/api` `TokenGetter`). */
export type TokenGetter = () => Promise<string | null | undefined>;

/**
 * Build a per-request Clerk token getter from the reactive Clerk context. The returned closure
 * reads `ctx.session` at CALL TIME, so it always mints a fresh (short-lived) session token — never
 * a captured/stale one. This is the client half of dealbreaker #1 (getToken per request); the
 * server half flows through `handleFetch` in `hooks.server.ts`.
 */
export function clerkTokenGetter(ctx: ClerkContext): TokenGetter {
	return async () => (await ctx.session?.getToken()) ?? null;
}
