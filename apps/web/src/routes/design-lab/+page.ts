import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Internal component showcase — dev server only, never shipped.
export const load = () => {
	if (!dev) error(404, 'Not found');
};
