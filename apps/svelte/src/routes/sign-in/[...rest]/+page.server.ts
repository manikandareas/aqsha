import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Already signed in → skip the sign-in screen (mirror `apps/web/app/sign-in/.../page.tsx`). */
export const load: PageServerLoad = ({ locals }) => {
	if (locals.auth().userId) redirect(303, '/app');
};
