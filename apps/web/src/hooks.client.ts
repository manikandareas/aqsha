import type { HandleClientError } from '@sveltejs/kit';
import { publicEnv } from '$lib/env/public';

if (publicEnv.PUBLIC_SENTRY_DSN) {
	const init = () =>
		void import('$lib/observability/sentry').then(({ initClientSentry }) =>
			initClientSentry(publicEnv)
		);
	if ('requestIdleCallback' in window) window.requestIdleCallback(init, { timeout: 2_000 });
	else globalThis.setTimeout(init, 0);
}

/**
 * Unexpected client error → Sentry (via `handleErrorWithSentry`) + shape `App.Error` rendered by
 * `+error.svelte`. Expected errors (`error()`) do not pass through here.
 */
const handleClientError: HandleClientError = ({ error }) => {
	console.error('[svelte:client] unexpected error', error);
	if (publicEnv.PUBLIC_SENTRY_DSN) {
		void import('@sentry/sveltekit').then((sentry) => sentry.captureException(error));
	}
	return { message: 'Terjadi kesalahan tak terduga.', code: 'unexpected' };
};

export const handleError = handleClientError;
