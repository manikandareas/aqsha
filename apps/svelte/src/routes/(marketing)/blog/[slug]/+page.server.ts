import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createPageMetadata, siteUrl, type PageSeo } from '$lib/seo';
import { getPublishedPost } from '$lib/features/blog/lib/posts';

/** Blog post detail — page metadata + BlogPosting JSON-LD. */
export const load: PageServerLoad = ({ params }) => {
	const post = getPublishedPost(params.slug);
	if (!post) error(404, { message: 'Halaman tidak ditemukan', code: 'not_found' });

	const modified = post.updated ?? post.publishedAt;

	// BlogPosting JSON-LD — mereferensi Organization existing (structured-data), jangan redefine.
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		'@id': `${siteUrl}${post.url}#article`,
		mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteUrl}${post.url}` },
		headline: post.title,
		description: post.excerpt,
		datePublished: post.publishedAt,
		dateModified: modified,
		inLanguage: 'id-ID',
		url: `${siteUrl}${post.url}`,
		...(post.cover ? { image: `${siteUrl}${post.cover}` } : {}),
		...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
		publisher: { '@id': `${siteUrl}/#organization` }
	};

	const seo: PageSeo = {
		...createPageMetadata({ title: post.title, description: post.excerpt, path: post.url }),
		ogType: 'article',
		article: {
			publishedTime: post.publishedAt,
			modifiedTime: modified,
			authors: post.author ? [post.author] : undefined
		},
		image: post.cover ? `${siteUrl}${post.cover}` : undefined,
		jsonLd: [jsonLd]
	};

	return { post, seo };
};
