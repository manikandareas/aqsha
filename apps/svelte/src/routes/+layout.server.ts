import { buildClerkProps } from 'svelte-clerk/server';
import type { LayoutServerLoad } from './$types';

/**
 * Feed the SSR auth snapshot to `<ClerkProvider>` so Clerk components/hooks have state during SSR,
 * hydration, and CSR (no auth flash). Runs on every request; `locals.auth` is set by
 * `withClerkHandler`.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	return { ...buildClerkProps(locals.auth()) };
};
