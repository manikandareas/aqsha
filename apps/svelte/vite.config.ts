import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from '@sentry/sveltekit';

// SvelteKit/Svelte config (adapter, runes, preprocess) lives in svelte.config.js
// so shadcn-svelte CLI / Sentry / editor tooling read one source of truth.

// Sentry vite plugin = HANYA upload source map saat build (SDK runtime di hooks.{client,server}.ts,
// mandiri dari plugin). Aktif hanya bila trio token+org+project ada (mirror web `sourcemapUploadEnabled`);
// absen → build SvelteKit normal, tak tersentuh. Build-time env via process.env (bukan $env/*).
const sentrySourcemapUpload = Boolean(
	process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default defineConfig({
	plugins: [
		tailwindcss(),
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
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
