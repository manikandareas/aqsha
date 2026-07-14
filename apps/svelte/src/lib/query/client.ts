import { QueryClient } from '@tanstack/svelte-query';

/**
 * A fresh `QueryClient` PER REQUEST (plan §3.5). Called from the root `+layout.svelte` `<script>`,
 * which SvelteKit instantiates once per SSR request — never a module-level singleton, which would
 * leak server-state across users on the shared Node process. Mirrors `useState(() => new
 * QueryClient())` in `apps/web/lib/query-provider.tsx`.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			// networkMode 'always': our data plane is same-infra (localhost API / same-origin proxy), so
			// never pause fetches on the browser's `navigator.onLine` heuristic — which misfires in some
			// environments and would strand queries in `fetchStatus:'paused'`. Parity note vs web: web
			// relies on the default 'online' mode; Svelte adopts 'always' to avoid that failure mode.
			queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1, networkMode: 'always' },
			mutations: { networkMode: 'always' }
		}
	});
}
