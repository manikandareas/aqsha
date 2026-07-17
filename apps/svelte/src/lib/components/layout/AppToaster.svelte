<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import { mode } from 'mode-watcher';

	/**
	 * Global toast host (`svelte-sonner`). Surface + kind hues live in
	 * `src/styles/toast.css` (alert-surface formula); this host only wires
	 * layout, typography, and action chrome. Theme follows the resolved
	 * mode-watcher mode; `undefined` during SSR falls back to `light`.
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
			toast: 'gap-3! px-4! py-[11px]!',
			title: 'text-control! font-semibold!',
			description: 'text-label! text-muted-foreground!',
			actionButton:
				'btn-lip! border-2! border-border! bg-background! text-foreground! rounded-sm! h-7! px-2.5! text-label! font-bold! hover:bg-muted!',
			cancelButton:
				'btn-lip! border-2! border-border! bg-background! text-foreground! rounded-sm! h-7! px-2.5! text-label! font-bold! hover:bg-muted!',
			closeButton: 'border-2! border-border! bg-card! text-foreground! hover:bg-muted!'
		}
	}}
	visibleToasts={4}
/>
