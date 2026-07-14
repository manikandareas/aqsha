import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Kit config lives here (not inline in vite.config.ts) so that all integrated
// tooling that reads svelte.config.js — shadcn-svelte CLI, Sentry SvelteKit,
// editor extensions — sees the same config. Since SvelteKit 2.62, inlining the
// config in the vite plugin makes SvelteKit IGNORE this file, which would break
// those tools. See docs/migration/apps-svelte-phase1-decision-record.md.

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Preprocess <script lang="ts"> and <style> via Vite (PostCSS/Tailwind).
	preprocess: vitePreprocess(),

	// Runes mode only for app code (plan §3.4). Legacy syntax in our own files
	// (`export let`, `$:`, `on:*`) becomes a compile error — stronger than lint.
	// node_modules libraries keep their own compile mode so legacy-authored
	// dependencies still build.
	dynamicCompileOptions({ filename }) {
		if (!filename.includes('node_modules')) {
			return { runes: true };
		}
	},

	kit: {
		// Node server behind Dokploy (plan §2). ORIGIN/PROTOCOL_HEADER/HOST_HEADER
		// + trustedOrigins are configured at deploy time (Phase 12).
		adapter: adapter()
	}
};

export default config;
