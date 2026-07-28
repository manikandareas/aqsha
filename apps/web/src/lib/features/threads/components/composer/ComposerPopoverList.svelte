<script lang="ts">
	import type { Snippet } from 'svelte';

	let { id, children }: { id: string; children: Snippet } = $props();
</script>

<div {id} role="listbox" class="max-h-[19rem] overflow-y-auto px-1.5 py-1.5">
	{@render children()}
</div>
