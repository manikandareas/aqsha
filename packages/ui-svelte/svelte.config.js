import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Standalone (non-Kit) config so svelte-check and editor tooling can preprocess
// <script lang="ts">. Components are authored in runes mode; consumers compile
// this package from raw source with their own Vite/Svelte toolchain.

/** @type {{ preprocess: ReturnType<typeof vitePreprocess>, compilerOptions: import('svelte/compiler').CompileOptions }} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true
	}
};

export default config;
