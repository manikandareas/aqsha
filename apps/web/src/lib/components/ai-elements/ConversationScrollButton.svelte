<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ArrowDownIcon } from '$lib/icons';
	import { getStickToBottom } from './conversation-state.svelte';

	// Floating "jump to latest" button, shown ONLY while not at the bottom (reads `isAtBottom` from the
	// follow-bottom context). Place inside `Conversation`'s `overlay` snippet.

	let { class: klass }: { class?: string } = $props();

	const stick = getStickToBottom();
</script>

{#if !stick.isAtBottom}
	<Button
		type="button"
		variant="outline"
		size="icon"
		onclick={() => stick.scrollToBottom()}
		class={cn(
			'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted',
			klass
		)}
	>
		<Icon icon={ArrowDownIcon} class="size-4" />
	</Button>
{/if}
