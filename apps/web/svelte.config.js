import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Kit config lives here (not inline in vite.config.ts) so that all integrated
// tooling that reads svelte.config.js — shadcn-svelte CLI, Sentry SvelteKit,
// editor extensions — sees the same config. Since SvelteKit 2.62, inlining the
// config in the vite plugin makes SvelteKit IGNORE this file, which would break
// those tools.

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Preprocess <script lang="ts"> and <style> via Vite (PostCSS/Tailwind).
	preprocess: vitePreprocess(),

	// Runes mode only for app code. Legacy syntax in our own files (`export let`, `$:`, `on:*`)
	// becomes a compile error — stronger than lint. node_modules libraries keep their own compile
	// mode so legacy-authored dependencies still build. @aqsha/ui-svelte is first-party raw-source
	// Svelte, so it gets the same runes guarantee even if resolved through a node_modules symlink.
	dynamicCompileOptions({ filename }) {
		if (!filename.includes('node_modules') || filename.includes('@aqsha/ui-svelte')) {
			return { runes: true };
		}
	},

	kit: {
		// Node server behind Dokploy. ORIGIN/PROTOCOL_HEADER/HOST_HEADER + trustedOrigins
		// are configured at deploy time.
		adapter: adapter(),

		// Content Collections generated module (blog/changelog). Alias declared here (not tsconfig
		// `paths`) because SvelteKit regenerates `.svelte-kit/tsconfig.json` and overwrites app `paths`;
		// `kit.alias` is the supported way to add both the Vite + tsc alias. The `@content-collections/vite`
		// plugin generates the folder on dev/build; `content-collections build` (scripts) generates it
		// ahead of typecheck/test.
		alias: {
			'content-collections': './.content-collections/generated'
		}
	}
};

export default config;
