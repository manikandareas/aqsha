<script lang="ts">
	import { CheckIcon, CopyIcon, Icon } from '$lib/icons';

	/**
	 * Copy-to-clipboard citation chip — port 1:1 of apps/web/components/citation/copy-citation-button.tsx.
	 * `children` is a plain string label (matches the web prop shape). Shows a check for 1.2s after copy.
	 */
	let { value, children }: { value: string; children: string } = $props();

	let copied = $state(false);

	function copy() {
		void navigator.clipboard.writeText(value).then(() => {
			copied = true;
			window.setTimeout(() => (copied = false), 1_200);
		});
	}
</script>

<button
	type="button"
	onclick={copy}
	class="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.99]"
>
	<span>{children}</span>
	{#if copied}
		<Icon icon={CheckIcon} class="size-3.5 text-mint-foreground" />
	{:else}
		<Icon icon={CopyIcon} class="size-3.5" />
	{/if}
</button>
