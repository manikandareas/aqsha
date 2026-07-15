<script lang="ts">
	import { cn } from '$lib/utils';
	import GenerativeCover from '$lib/components/GenerativeCover.svelte';
	import type { ChangelogEntry } from '../types';

	// `sizes` forwarded for call-site API consistency; a plain `<img>` does not use it for srcset selection.
	let {
		entry,
		class: className,
		sizes = '(min-width: 640px) 208px, 100vw'
	}: { entry: ChangelogEntry; class?: string; sizes?: string } = $props();
</script>

<!-- Banner/thumbnail changelog — mengisi penuh wadahnya (`absolute inset-0`). Pemanggil menentukan
     ukuran/aspect + border/rounding lewat `class`. `preview` (frontmatter) kalau ada; kalau kosong →
     cover generatif deterministik (gradien brand dari hash judul). -->
<div class={cn('relative w-full overflow-hidden bg-muted', className)}>
	{#if entry.preview}
		<img src={entry.preview} alt="" {sizes} class="absolute inset-0 h-full w-full object-cover" />
	{:else}
		<GenerativeCover title={entry.title} label={entry.version ? `v${entry.version}` : 'Rilis'} />
	{/if}
</div>
