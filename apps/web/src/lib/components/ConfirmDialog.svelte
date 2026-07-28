<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { readableApiErrorMessage } from '$lib/errors';

	/**
	 * Confirm dialog. Controlled `open`, runs an async `onConfirm`, shows a normalized error on
	 * failure and closes on success. `children` (optional) render extra body content between the
	 * description and the footer.
	 */
	let {
		open,
		title,
		description,
		confirmLabel,
		children,
		onOpenChange,
		onConfirm
	}: {
		open: boolean;
		title: string;
		description: string;
		confirmLabel: string;
		children?: Snippet;
		onOpenChange: (open: boolean) => void;
		onConfirm: () => Promise<unknown>;
	} = $props();

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	const reduce = $derived(prefersReducedMotion.current);

	async function handleConfirm() {
		isSubmitting = true;
		error = null;
		try {
			await onConfirm();
			onOpenChange(false);
			isSubmitting = false;
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, 'Aksi gagal.');
			isSubmitting = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		{@render children?.()}
		{#if error}
			<p
				class="text-[12px] font-medium text-destructive"
				transition:slide={reduce ? { duration: 0 } : { duration: 160 }}
			>
				{error}
			</p>
		{/if}
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button type="button" variant="outline" disabled={isSubmitting} {...props}>Batal</Button>
				{/snippet}
			</Dialog.Close>
			<Button type="button" variant="destructive" disabled={isSubmitting} onclick={handleConfirm}>
				{confirmLabel}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
