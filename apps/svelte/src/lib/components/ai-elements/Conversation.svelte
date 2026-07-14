<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { StickToBottom, stickToBottomContext } from './conversation-state.svelte';

	// THC-7 — the transcript viewport. Port of `apps/web/components/ai-elements/conversation-root.tsx`
	// (`<StickToBottom initial="smooth" resize="smooth" role="log">`). Owns the follow-bottom engine and
	// provides it via context; `children` is the scrollable transcript, `overlay` is the fixed layer
	// (place `<ConversationScrollButton/>` there). No virtualization (§6 — must not change behavior).

	let {
		class: klass,
		children,
		overlay
	}: { class?: string; children?: Snippet; overlay?: Snippet } = $props();

	const stick = new StickToBottom();
	stickToBottomContext.set(stick);
</script>

<div class={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden', klass)}>
	<div
		{@attach stick.attachScroller}
		role="log"
		class="absolute inset-0 overflow-x-hidden overflow-y-auto"
	>
		{@render children?.()}
	</div>
	{@render overlay?.()}
</div>
