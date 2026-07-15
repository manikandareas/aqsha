import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createPageMetadata } from '$lib/seo';

/** Already signed in → skip sign-up. */
export const load: PageServerLoad = ({ locals }) => {
	if (locals.auth().userId) redirect(303, '/app');
	return {
		seo: createPageMetadata({
			title: 'Create account',
			description: 'Create an Aqsha account to start building research workspaces.',
			path: '/sign-up'
		})
	};
};
