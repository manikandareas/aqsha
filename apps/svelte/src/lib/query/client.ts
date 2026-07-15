import { QueryClient } from '@tanstack/svelte-query';

/**
 * A fresh `QueryClient` PER REQUEST. Called from the root `+layout.svelte` `<script>`, which
 * SvelteKit instantiates once per SSR request — never a module-level singleton, which would leak
 * server-state across users on the shared Node process.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			// networkMode 'always': our data plane is same-infra (localhost API / same-origin proxy), so
			// never pause fetches on the browser's `navigator.onLine` heuristic — which misfires in some
			// environments and would strand queries in `fetchStatus:'paused'`.
			queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1, networkMode: 'always' },
			mutations: { networkMode: 'always' }
		}
	});
}
