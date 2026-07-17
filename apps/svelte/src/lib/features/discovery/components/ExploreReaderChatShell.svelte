<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { Icon, ChevronRightIcon } from '$lib/icons';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';

	/**
	 * Reader shell for the Explore pages (paper & news). Owns the fixed `h-svh` frame + breadcrumb header;
	 * the reader body renders as `children`. Astra chat was removed here — research chat lives inside a
	 * project now, so a global (workspace-less) reader chat is intentionally gone.
	 */
	let {
		breadcrumb,
		children
	}: {
		breadcrumb: string;
		children: Snippet;
	} = $props();
</script>

<main class="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
	<div class="min-h-0 flex-1 overflow-y-auto">
		<header class={panelHeaderBarClass}>
			<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-[13px]">
				<a
					href={resolve('/app/(product)/explore')}
					class="shrink-0 truncate rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					Jelajahi
				</a>
				<Icon icon={ChevronRightIcon} class="size-3.5 shrink-0 text-muted-foreground/60" />
				<span class="min-w-0 truncate font-medium text-foreground">{breadcrumb}</span>
			</nav>
		</header>
		{@render children()}
	</div>
</main>
