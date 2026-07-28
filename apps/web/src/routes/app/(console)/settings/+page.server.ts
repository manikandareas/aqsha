import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/app/settings` → `/app/settings/overview`. Server-side redirect so there is no client flash;
 * auth/onboarding gating ran in hooks.
 */
export const load: PageServerLoad = () => {
	redirect(307, '/app/settings/overview');
};
