import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Already signed in → skip the sign-in screen. */
export const load: PageServerLoad = ({ locals }) => {
	if (locals.auth().userId) redirect(303, '/app');
};
