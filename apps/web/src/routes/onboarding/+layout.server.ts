import { redirect } from '@sveltejs/kit';
import { buildClerkProps } from 'svelte-clerk/server';
import { dehydrate } from '@tanstack/svelte-query';
import { createServerApiClient } from '$lib/server/api';
import { onboardingRouteState } from '$lib/server/onboarding-route';
import { createQueryClient, queryBootstrapId, queryKeys, unwrap } from '$lib/query';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const auth = locals.auth();
	const api = createServerApiClient(() => auth.getToken());
	const onboarding = await onboardingRouteState('onboarding', async () =>
		unwrap(await api.onboarding.status.get())
	);

	if (onboarding.redirectTo) redirect(303, onboarding.redirectTo);
	const queryClient = createQueryClient({ server: true });
	if (onboarding.status) {
		queryClient.setQueryData(queryKeys.onboarding.status(), onboarding.status);
	}

	return {
		...buildClerkProps(auth),
		bootstrap: {
			id: queryBootstrapId('/onboarding'),
			critical: dehydrate(queryClient),
			deferred: {}
		}
	};
};
