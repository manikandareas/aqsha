<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import { mode } from 'mode-watcher';

	/**
	 * Global toast host — ported 1:1 from apps/web/components/app-toaster.tsx (`sonner`
	 * → `svelte-sonner`). Same copy/duration/action surface, same layout knobs
	 * (closeButton, expand, gap 10, offset 20, bottom-right, visibleToasts 4) and the
	 * Aqsha toast card class. Theme follows the resolved mode-watcher mode (web read
	 * next-themes `resolvedTheme`); `undefined` during SSR falls back to `light`.
	 */
</script>

<Toaster
	closeButton
	expand
	gap={10}
	offset={20}
	position="bottom-right"
	theme={mode.current ?? 'light'}
	toastOptions={{
		classes: {
			toast: 'border-border bg-card text-card-foreground shadow-aqsha'
		}
	}}
	visibleToasts={4}
/>
