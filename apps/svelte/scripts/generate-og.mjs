/**
 * One-off generator untuk `static/og.png` (1200×630) — padanan `apps/web/app/opengraph-image.tsx`
 * (Next `ImageResponse`/satori). Di apps/svelte, OG card = ASET STATIS (nol runtime/build dep,
 * bebas risiko native @resvg di Docker Phase 12), bukan endpoint dinamis.
 *
 * Reproduksi (deps ad-hoc, JANGAN tambah ke package.json):
 *   cd apps/svelte
 *   npm i --no-save satori @resvg/resvg-js
 *   OG_OUT=static/og.png node scripts/generate-og.mjs
 *
 * Teks di-derive dari `lib/seo/config.ts` `ogImage` — sinkronkan bila copy berubah.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const OUT = process.env.OG_OUT ?? 'static/og.png';
const SITE_NAME = 'Aqsha';
const TITLE = 'Asisten AI buat skripsi, tesis & paper';
const SUBTITLE = 'Sumber yang nggak ngarang.';
const THEME = '#0a0a0a';
const BG = '#ffffff';

const FONTS = {
	400: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
	600: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf',
	700: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf'
};

async function loadFont(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`font fetch failed ${res.status}: ${url}`);
	return Buffer.from(await res.arrayBuffer());
}

const tree = {
	type: 'div',
	props: {
		style: {
			width: '100%',
			height: '100%',
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'space-between',
			padding: '88px',
			background: THEME,
			color: BG,
			fontFamily: 'Inter'
		},
		children: [
			{
				type: 'div',
				props: {
					style: { fontSize: 40, fontWeight: 600, letterSpacing: '-0.01em' },
					children: SITE_NAME
				}
			},
			{
				type: 'div',
				props: {
					style: { display: 'flex', flexDirection: 'column', gap: 20 },
					children: [
						{
							type: 'div',
							props: {
								style: {
									fontSize: 76,
									fontWeight: 700,
									lineHeight: 1.05,
									letterSpacing: '-0.03em'
								},
								children: TITLE
							}
						},
						{
							type: 'div',
							props: { style: { fontSize: 38, opacity: 0.72 }, children: SUBTITLE }
						}
					]
				}
			}
		]
	}
};

const [r400, r600, r700] = await Promise.all([
	loadFont(FONTS[400]),
	loadFont(FONTS[600]),
	loadFont(FONTS[700])
]);

const svg = await satori(tree, {
	width: 1200,
	height: 630,
	fonts: [
		{ name: 'Inter', data: r400, weight: 400, style: 'normal' },
		{ name: 'Inter', data: r600, weight: 600, style: 'normal' },
		{ name: 'Inter', data: r700, weight: 700, style: 'normal' }
	]
});

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${png.length} bytes)`);
