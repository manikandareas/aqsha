import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Satu dokumen, satu alamat. Rute lama tetap hidup sebagai pengalih supaya tautan
// yang sudah tersebar tidak mati, membawa asal proyeknya lewat query.
export const load: PageLoad = ({ params }) => {
	const target = resolve('/app/(product)/artifacts/[artifactId]', {
		artifactId: params.artifactId
	});
	redirect(307, `${target}?project=${encodeURIComponent(params.projectId)}`);
};
