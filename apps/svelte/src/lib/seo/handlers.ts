/**
 * Pure builders untuk handler SEO (robots/sitemap/manifest) — dipisah dari `+server.ts` agar
 * unit-testable tanpa HTTP. Serialisasi XML/robots ditulis eksplisit di sini (SvelteKit tak punya
 * generator metadata Next).
 */
import { backgroundColor, defaultDescription, siteName, themeColor } from './config';

// ── robots.txt ──────────────────────────────────────────────────────────────

/**
 * `allowIndexing=true` → allow /, disallow app/auth/onboarding, host + sitemap.
 * `false` (preview) → disallow-all supaya mesin telusur tak meng-index subdomain preview.
 */
export function buildRobotsTxt({
	siteUrl,
	allowIndexing
}: {
	siteUrl: string;
	allowIndexing: boolean;
}): string {
	if (!allowIndexing) {
		return ['User-Agent: *', 'Disallow: /', ''].join('\n');
	}
	return [
		'User-Agent: *',
		'Allow: /',
		'Disallow: /app',
		'Disallow: /sign-in',
		'Disallow: /sign-up',
		'Disallow: /onboarding',
		'',
		`Host: ${siteUrl}`,
		`Sitemap: ${siteUrl}/sitemap.xml`,
		''
	].join('\n');
}

// ── sitemap.xml ───────────────────────────────────────────────────────────────

export type SitemapUrl = {
	loc: string;
	/** ISO datetime (`Date.toISOString()`). */
	lastmod?: string;
	changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
	priority: number;
};

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Serialisasi daftar URL → sitemap XML valid (schema sitemaps.org 0.9). */
export function buildSitemapXml(urls: SitemapUrl[]): string {
	const body = urls
		.map((u) => {
			const lines = [`<loc>${escapeXml(u.loc)}</loc>`];
			if (u.lastmod) lines.push(`<lastmod>${u.lastmod}</lastmod>`);
			lines.push(`<changefreq>${u.changefreq}</changefreq>`);
			lines.push(`<priority>${u.priority}</priority>`);
			return `<url>\n${lines.map((l) => `  ${l}`).join('\n')}\n</url>`;
		})
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ── manifest.webmanifest ──────────────────────────────────────────────────────

/** Web app manifest object — di-`JSON.stringify` di route. */
export function buildWebManifest(): Record<string, unknown> {
	return {
		name: siteName,
		short_name: siteName,
		description: defaultDescription,
		start_url: '/',
		display: 'standalone',
		theme_color: themeColor,
		background_color: backgroundColor,
		icons: [
			{ src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{
				src: '/web-app-manifest-192x192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'maskable'
			},
			{ src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			{
				src: '/web-app-manifest-512x512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'maskable'
			}
		]
	};
}
