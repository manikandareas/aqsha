import { describe, expect, it } from 'vitest';
import { buildRobotsTxt, buildSitemapXml, buildWebManifest, type SitemapUrl } from './handlers';

describe('buildRobotsTxt', () => {
	it('allowIndexing=true → allow /, disallow app/auth/onboarding, host+sitemap', () => {
		const out = buildRobotsTxt({ siteUrl: 'https://aqshara.com', allowIndexing: true });
		expect(out).toBe(
			[
				'User-Agent: *',
				'Allow: /',
				'Disallow: /app',
				'Disallow: /sign-in',
				'Disallow: /sign-up',
				'Disallow: /onboarding',
				'',
				'Host: https://aqshara.com',
				'Sitemap: https://aqshara.com/sitemap.xml',
				''
			].join('\n')
		);
	});

	it('allowIndexing=false → disallow-all (preview noindex)', () => {
		expect(buildRobotsTxt({ siteUrl: 'https://aqshara.com', allowIndexing: false })).toBe(
			'User-Agent: *\nDisallow: /\n'
		);
	});
});

describe('buildSitemapXml', () => {
	it('serialize loc/lastmod/changefreq/priority + escape', () => {
		const urls: SitemapUrl[] = [
			{ loc: 'https://aqshara.com', changefreq: 'weekly', priority: 1 },
			{
				loc: 'https://aqshara.com/blog/halo',
				lastmod: '2026-06-27T00:00:00.000Z',
				changefreq: 'monthly',
				priority: 0.6
			}
		];
		const xml = buildSitemapXml(urls);
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(xml).toContain('<loc>https://aqshara.com</loc>');
		expect(xml).toContain('<lastmod>2026-06-27T00:00:00.000Z</lastmod>');
		expect(xml).toContain('<priority>0.6</priority>');
		// url tanpa lastmod tak memancarkan tag lastmod
		expect(xml.match(/<lastmod>/g)?.length).toBe(1);
	});

	it('escape karakter XML di loc', () => {
		const xml = buildSitemapXml([
			{ loc: 'https://x.test/?a=1&b=2', changefreq: 'weekly', priority: 1 }
		]);
		expect(xml).toContain('<loc>https://x.test/?a=1&amp;b=2</loc>');
	});
});

describe('buildWebManifest', () => {
	it('manifest shape (name/short_name/display/theme/icons)', () => {
		const m = buildWebManifest();
		expect(m.name).toBe('Aqsha');
		expect(m.short_name).toBe('Aqsha');
		expect(m.start_url).toBe('/');
		expect(m.display).toBe('standalone');
		expect(m.theme_color).toBe('#0a0a0a');
		expect(m.background_color).toBe('#ffffff');
		expect((m.icons as unknown[]).length).toBe(4);
	});
});
