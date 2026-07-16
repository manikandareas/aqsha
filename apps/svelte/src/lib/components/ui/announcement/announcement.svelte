<script lang="ts" module>
	import { createContext } from '$lib/context';

	type AnnouncementContextValue = { readonly themed: boolean };
	/** Shared `themed` flag between Announcement and its Tag. */
	export const announcementContext = createContext<AnnouncementContextValue>('announcement');
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge, type BadgeVariant } from '@aqsha/ui-svelte/components/badge';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Announcement pill. A rounded Badge with a `themed` context read by `AnnouncementTag`. `h-auto`
	 * Badge with a `themed` context read by `AnnouncementTag`. `h-auto` releases Badge's fixed
	 * height so the tag/title padding is not clipped by `overflow-hidden`.
	 */
	let {
		variant = 'outline',
		themed = false,
		class: className,
		children,
		...restProps
	}: HTMLAnchorAttributes & {
		variant?: BadgeVariant;
		themed?: boolean;
		children?: Snippet;
	} = $props();

	announcementContext.set({
		get themed() {
			return themed;
		}
	});
</script>

<Badge
	{variant}
	class={cn(
		'h-auto max-w-full gap-2 rounded-full bg-background px-3 py-0.5 font-medium shadow-sm transition-all',
		'hover:shadow-md',
		themed && 'border-foreground/5',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</Badge>
