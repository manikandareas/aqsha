/**
 * Metadata helper — menghasilkan objek `PageSeo` bertipe yang di-render `SeoHead.svelte` ke
 * `<svelte:head>` (SvelteKit tak menyuntik metadata otomatis seperti Next). Konstanta
 * OG/site/locale/card diisi `SeoHead`.
 */
import { defaultDescription, siteName, siteUrl } from './config';

export { siteName };

export type OgType = 'website' | 'article';

/** Metadata artikel (blog detail) — `openGraph.type:"article"`. */
export type ArticleMeta = {
	publishedTime: string;
	modifiedTime: string;
	authors?: string[];
};

/** Objek metadata halaman yang dinormalisasi. Di-render `SeoHead`. */
export type PageSeo = {
	/** Judul mentah (tanpa template " | Aqsha"). `<title>` = `${title} | ${siteName}`; og/twitter = mentah. */
	title: string;
	description: string;
	/** URL canonical absolut (og:url = canonical). */
	canonical: string;
	/** og:type — default 'website'. */
	ogType?: OgType;
	/** Metadata artikel bila `ogType:'article'`. */
	article?: ArticleMeta;
	/** Override gambar OG/Twitter (URL absolut). Default = kartu OG situs. */
	image?: string;
	/** JSON-LD (structured data) untuk disematkan `<script type="application/ld+json">`. */
	jsonLd?: unknown[];
};

type PageMetadataInput = {
	title: string;
	description?: string;
	/** Path absolut situs (untuk canonical + og:url), mis. "/" atau "/sign-up". */
	path?: string;
};

export function createPageMetadata({
	title,
	description = defaultDescription,
	path = '/'
}: PageMetadataInput): PageSeo {
	return {
		title,
		description,
		canonical: `${siteUrl}${path}`,
		ogType: 'website'
	};
}
