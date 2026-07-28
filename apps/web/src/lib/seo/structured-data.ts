/**
 * JSON-LD identitas + FAQ untuk landing. Browser-safe: harga di-derive dari `$lib/plan` — JANGAN
 * impor `@aqsha/services`. Mengembalikan SATU objek `@graph` (Organization + WebSite +
 * SoftwareApplication + FAQPage); di-render `SeoHead` sebagai satu `<script type="application/ld+json">`.
 */
import { PLAN_CATALOG, PUBLIC_PLAN_KEYS } from '$lib/plan/catalog';
import { faqItems } from '$lib/features/marketing/faq-data';
import {
	contactEmail,
	defaultDescription,
	orgLegalName,
	sameAs,
	siteName,
	siteUrl
} from './config';

/** Bangun graph JSON-LD landing (dipanggil di `load` / komponen). */
export function buildLandingJsonLd(): Record<string, unknown> {
	// Derive harga dari PLAN_CATALOG (SSOT) — jangan duplikat angka.
	const paidPrices = PUBLIC_PLAN_KEYS.map((k) => PLAN_CATALOG[k].monthlyPriceIdr);
	const logoUrl = `${siteUrl}/web-app-manifest-512x512.png`;

	const organization = {
		'@type': 'Organization',
		'@id': `${siteUrl}/#organization`,
		name: orgLegalName,
		url: siteUrl,
		logo: logoUrl,
		email: contactEmail,
		...(sameAs.length > 0 ? { sameAs } : {})
	};

	const website = {
		'@type': 'WebSite',
		'@id': `${siteUrl}/#website`,
		name: siteName,
		url: siteUrl,
		inLanguage: 'id-ID',
		publisher: { '@id': `${siteUrl}/#organization` }
	};

	const softwareApplication = {
		'@type': 'SoftwareApplication',
		name: siteName,
		description: defaultDescription,
		applicationCategory: 'EducationalApplication',
		operatingSystem: 'Web',
		url: siteUrl,
		offers: {
			'@type': 'AggregateOffer',
			priceCurrency: 'IDR',
			lowPrice: Math.min(...paidPrices),
			highPrice: Math.max(...paidPrices),
			offerCount: paidPrices.length
		}
	};

	const faqPage = {
		'@type': 'FAQPage',
		'@id': `${siteUrl}/#faq`,
		mainEntity: faqItems.map((item) => ({
			'@type': 'Question',
			name: item.q,
			acceptedAnswer: { '@type': 'Answer', text: item.a }
		}))
	};

	return {
		'@context': 'https://schema.org',
		'@graph': [organization, website, softwareApplication, faqPage]
	};
}
