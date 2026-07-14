<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { ThemeState, themeContext } from '$lib/theme';

	/**
	 * Theme boundary — padanan web `components/theme-provider.tsx` (next-themes).
	 * Provides the theme control seam via context (§3.5 scoped, not module-level)
	 * and mounts `<ModeWatcher>`.
	 *
	 * Anti-flash (§3.7): `ModeWatcher` (default `disableHeadScriptInjection=false`)
	 * SSR-injects a blocking init script into `<svelte:head>` that sets `.dark` +
	 * `color-scheme` before paint from the `mode-watcher-mode` localStorage key —
	 * the exact equivalent of the next-themes inline app.html script (chosen over a
	 * hand-rolled app.html script so the storage key/config never desync). Props
	 * mirror web next-themes: `defaultTheme="system"`+`enableSystem` → `track` +
	 * `defaultMode="system"`; `disableTransitionOnChange` → `disableTransitions`.
	 */
	let { children }: { children: Snippet } = $props();

	themeContext.set(new ThemeState());
</script>

<ModeWatcher track defaultMode="system" disableTransitions />
{@render children()}
