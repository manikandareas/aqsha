<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared shell for the in-composer popovers (slash command + `@mention`) — WITHOUT cmdk; keyboard nav
	// is owned by TokenizedPromptInput, so items are plain div/button (lighter; no new dep).
	let { children }: { children: Snippet } = $props();
</script>

<div class="rounded-xl bg-popover p-0">
	{@render children()}
</div>
