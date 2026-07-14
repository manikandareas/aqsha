<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';
	import { Icon, FolderIcon } from '$lib/icons';

	/**
	 * Save-to-Workspace button — **Phase 9 seam**. Web (`features/artifacts/components/
	 * save-to-workspace-button.tsx`) opens a `WorkspacePicker` dialog then `createUrl`; both the picker
	 * and the `useSaveUrl` mutation live in the workspaces/artifacts feature that lands in Phase 9. This
	 * placeholder preserves the card/reader footer layout (same button + icon + label + a11y) and, on
	 * click, tells the user the flow is coming. `onSaved` (the discovery interest +1) fires only once a
	 * real save succeeds → it stays wired but dormant until Phase 9 replaces this component.
	 */
	let {
		url,
		title,
		label = 'Simpan',
		ariaLabel,
		variant = 'outline',
		size = 'sm',
		class: className,
		onSaved
	}: {
		url: string;
		title?: string;
		label?: string;
		ariaLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		onSaved?: () => void;
	} = $props();

	// Referenced so the (API-compatible) props aren't flagged unused; the real save consumes them Phase 9.
	const target = $derived(title ? `"${title}"` : url);
</script>

<Button
	{variant}
	{size}
	class={className}
	aria-label={ariaLabel}
	title={ariaLabel}
	onclick={() => toast.info(`Simpan ${target} ke workspace hadir di fase berikutnya.`)}
	data-save-url={url}
	data-saved-hook={onSaved ? 'wired' : undefined}
>
	<Icon icon={FolderIcon} />
	{label}
</Button>
