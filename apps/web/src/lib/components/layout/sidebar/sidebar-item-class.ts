import { cn } from '@aqsha/ui-svelte/utils';

/**
 * Shared rail nav item classes — AppSidebar and SettingsRail must stay identical.
 * Active = mint tint + primary icon; inactive = muted ink that resolves on hover.
 */
export const sidebarItemBaseClass =
	'gap-2 font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5';

export function sidebarItemClass(active?: boolean) {
	return cn(
		sidebarItemBaseClass,
		active
			? 'bg-primary/10 text-foreground [&_svg]:text-primary'
			: 'text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'
	);
}
