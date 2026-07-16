<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import { mode } from 'mode-watcher';

	/**
	 * Global toast host (`svelte-sonner`). Same copy/duration/action surface, same layout knobs
	 * (closeButton, expand, gap 10, offset 20, bottom-right, visibleToasts 4) and the Aqsha toast
	 * card class. Theme follows the resolved mode-watcher mode; `undefined` during SSR falls back to
	 * `light`.
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
			// Alert-family surface: 2px border + hard 3px lip over the soft card shadow.
			toast: 'border-2! border-border! bg-card! text-card-foreground! rounded-lg! lip-pop',
			success:
				'[--alert-hue:var(--mint)] border-[color-mix(in_oklch,var(--alert-hue)_55%,var(--card))]! bg-[color-mix(in_oklch,var(--alert-hue)_26%,var(--card))]! shadow-[0_3px_0_0_color-mix(in_oklch,var(--alert-hue)_55%,var(--card)),var(--shadow-soft-card)]!',
			warning:
				'[--alert-hue:var(--lemon)] border-[color-mix(in_oklch,var(--alert-hue)_55%,var(--card))]! bg-[color-mix(in_oklch,var(--alert-hue)_26%,var(--card))]! shadow-[0_3px_0_0_color-mix(in_oklch,var(--alert-hue)_55%,var(--card)),var(--shadow-soft-card)]!',
			error:
				'[--alert-hue:var(--destructive)] border-[color-mix(in_oklch,var(--alert-hue)_55%,var(--card))]! bg-[color-mix(in_oklch,var(--alert-hue)_26%,var(--card))]! shadow-[0_3px_0_0_color-mix(in_oklch,var(--alert-hue)_55%,var(--card)),var(--shadow-soft-card)]!'
		}
	}}
	visibleToasts={4}
/>
