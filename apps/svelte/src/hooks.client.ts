import { handleErrorWithSentry } from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { publicEnv } from '$lib/env/public';
import { initClientSentry } from '$lib/observability';

// Init Sentry browser SDK sedini mungkin (module load = sebelum app hydrate). DSN kosong → no-op.
initClientSentry(publicEnv);

/**
 * Unexpected client error → Sentry (via `handleErrorWithSentry`) + shape `App.Error` rendered by
 * `+error.svelte`. Expected errors (`error()`) do not pass through here.
 */
const handleClientError: HandleClientError = ({ error }) => {
	console.error('[svelte:client] unexpected error', error);
	return { message: 'Terjadi kesalahan tak terduga.', code: 'unexpected' };
};

export const handleError = handleErrorWithSentry(handleClientError);
