<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { formatDateId } from '$lib/dates';
	import type { ChangelogEntry } from '../types';

	let { entry, class: className }: { entry: ChangelogEntry; class?: string } = $props();
</script>

<!-- Tanggal terbit + versi opsional dengan aksen token `text-chart-1`. Ukuran/margin via `class`. -->
<p class={cn('font-medium text-chart-1', className)}>
	<time datetime={entry.publishedAt}>{formatDateId(entry.publishedAt)}</time>
	{#if entry.version}<span class="text-chart-1/70"> · v{entry.version}</span>{/if}
</p>
