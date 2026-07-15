import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/app/settings` → `/app/settings/overview` (mirror web `app/app/settings/page.tsx` redirect).
 * Server-side redirect so there is no client flash; auth/onboarding gating ran in hooks (Phase 2).
 */
export const load: PageServerLoad = () => {
	redirect(307, '/app/settings/overview');
};
