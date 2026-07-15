<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { ThemeState, themeContext } from '$lib/theme';

	/**
	 * Theme boundary. Provides the theme control seam via context (scoped per component tree, not
	 * module-level) and mounts `<ModeWatcher>`.
	 *
	 * Anti-flash: `ModeWatcher` (default `disableHeadScriptInjection=false`) SSR-injects a blocking
	 * init script into `<svelte:head>` that sets `.dark` + `color-scheme` before paint from the
	 * `mode-watcher-mode` localStorage key. Props: `defaultTheme="system"`+`enableSystem` → `track` +
	 * `defaultMode="system"`; `disableTransitionOnChange` → `disableTransitions`.
	 */
	let { children }: { children: Snippet } = $props();

	themeContext.set(new ThemeState());
</script>

<ModeWatcher track defaultMode="system" disableTransitions />
{@render children()}
