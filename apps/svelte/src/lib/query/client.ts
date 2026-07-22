import { QueryClient } from '@tanstack/svelte-query';
import { browser } from '$app/environment';

/**
 * A fresh `QueryClient` PER REQUEST. Called from the root `+layout.svelte` `<script>`, which
 * SvelteKit instantiates once per SSR request — never a module-level singleton, which would leak
 * server-state across users on the shared Node process.
 */
export function createQueryClient(options: { server?: boolean } = {}): QueryClient {
	const server = options.server ?? !browser;
	return new QueryClient({
		defaultOptions: {
			// networkMode 'always': our data plane is same-infra (localhost API / same-origin proxy), so
			// never pause fetches on the browser's `navigator.onLine` heuristic — which misfires in some
			// environments and would strand queries in `fetchStatus:'paused'`.
			queries: {
				staleTime: 30_000,
				refetchOnWindowFocus: false,
				retry: server ? 0 : 1,
				networkMode: 'always'
			},
			mutations: { networkMode: 'always' }
		}
	});
}
