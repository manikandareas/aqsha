<script lang="ts">
	import { Icon, FileTextIcon, Loader2Icon, XIcon } from '$lib/icons';
	import { cn } from '$lib/utils';

	/**
	 * Single file card — document icon in a blue tile + file name (bold). `onRemove` → round X button
	 * (composer, staged). `onOpen` (message row, mutually exclusive with `onRemove`) → the whole chip
	 * is a button opening the artifact reader. Neither = read-only. `pending` (async index) → spinner.
	 * Mirror of web `file-chip.tsx`.
	 */
	let {
		id,
		title,
		mimeType,
		indexingStatus,
		onRemove,
		onOpen,
		class: className
	}: {
		id?: string;
		title: string;
		mimeType?: string | null;
		indexingStatus?: string | null;
		onRemove?: () => void;
		onOpen?: () => void;
		class?: string;
	} = $props();

	const pending = $derived(indexingStatus === 'pending');
	const base =
		'inline-flex max-w-[13rem] items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-2.5';
</script>

{#snippet body()}
	<span
		class="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
	>
		{#if pending}
			<Icon icon={Loader2Icon} class="size-4 animate-spin" />
		{:else}
			<Icon icon={FileTextIcon} class="size-4" />
		{/if}
	</span>
	<span class="min-w-0 truncate text-xs font-semibold text-foreground">{title}</span>
{/snippet}

{#if onOpen}
	<button
		type="button"
		data-artifact-id={id}
		data-mime-type={mimeType}
		onclick={onOpen}
		aria-label={`Buka ${title}`}
		class={cn(
			base,
			'text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
			className
		)}
	>
		{@render body()}
	</button>
{:else}
	<div data-artifact-id={id} data-mime-type={mimeType} class={cn(base, className)}>
		{@render body()}
		{#if onRemove}
			<button
				type="button"
				onclick={onRemove}
				aria-label={`Hapus ${title}`}
				class="ml-0.5 grid size-[18px] shrink-0 place-items-center rounded-full bg-foreground/10 text-foreground/70 transition-colors hover:bg-foreground/20 hover:text-foreground"
			>
				<Icon icon={XIcon} class="size-3" />
			</button>
		{/if}
	</div>
{/if}
