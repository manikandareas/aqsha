<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared full-viewport center slot for loading / status-error states on the journey canvas.
	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-svh items-center justify-center px-6">
	{@render children()}
</div>
