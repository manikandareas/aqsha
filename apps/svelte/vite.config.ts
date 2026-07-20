import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import contentCollections from '@content-collections/vite';

// SvelteKit/Svelte config (adapter, runes, preprocess) lives in svelte.config.js
// so shadcn-svelte CLI / Sentry / editor tooling read one source of truth.

// Sentry vite plugin uploads source maps at build time only (SDK runtime lives in hooks.{client,server}.ts).
// Active only when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set; otherwise the SvelteKit
// build is untouched. Build-time env via process.env (not $env/*).
const sentrySourcemapUpload = Boolean(
	process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default defineConfig({
	optimizeDeps: {
		include: ['@myriaddreamin/typst.ts', '@myriaddreamin/typst.ts/renderer']
	},
	plugins: [
		tailwindcss(),
		// Content Collections (blog/changelog) — generate `.content-collections/generated` saat
		// dev/build + watch konten. HARUS sebelum sveltekit(). Runtime alias `content-collections`
		// juga dipasang di svelte.config.js `kit.alias` agar svelte-check/tsc me-resolve tipe generated
		// (SvelteKit menimpa tsconfig `paths` → alias WAJIB lewat kit.alias, bukan tsconfig). Renderer =
		// compileMarkdown → HTML string (lihat content-collections.ts). Build tooling → devDependency.
		// DILEWATI di vitest: test memakai generated folder yang sudah di-build (prefiks script test),
		// dan watcher plugin mencegah proses vitest exit bersih ("close timed out").
		...(process.env.VITEST ? [] : [contentCollections()]),
		// sentrySvelteKit() → Promise<Plugin[]>; Vite meng-await elemen plugin (PluginOption menerima
		// Promise), jadi tak perlu async defineConfig. `autoInstrument:false`: kita tak trace
		// (tracesSampleRate 0) → tak perlu wrap load functions; plugin murni untuk source map. Harus
		// SEBELUM sveltekit().
		...(sentrySourcemapUpload
			? [
					sentrySvelteKit({
						autoInstrument: false,
						sourceMapsUploadOptions: {
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT,
							authToken: process.env.SENTRY_AUTH_TOKEN,
							sourcemaps: {
								filesToDeleteAfterUpload: ['./build/**/*.map']
							}
						}
					})
				]
			: []),
		sveltekit()
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'../../packages/ui-svelte/src/**/*.{test,spec}.{js,ts}'
					],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
