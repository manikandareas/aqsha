<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { getStickToBottom } from './conversation-state.svelte';

	// Port of `conversation-content.tsx` (`<StickToBottom.Content>`) — the inner sized flex column. Its
	// growth (streaming tokens) is observed by the follow-bottom engine via `{@attach}`.

	let { class: klass, children }: { class?: string; children?: Snippet } = $props();

	const stick = getStickToBottom();
</script>

<div
	{@attach stick.attachContent}
	class={cn('mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4', klass)}
>
	{@render children?.()}
</div>
