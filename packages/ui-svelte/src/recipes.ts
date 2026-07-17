/**
 * Shared class recipes for design-system primitives that share anatomy
 * (menu rows, calendar nav, micro group headings). Keep visual tweaks here
 * so dropdown / context / select / command stay in lockstep.
 */

export const menuItemClass =
	"relative flex cursor-default items-center gap-1.5 rounded-sm px-[11px] py-2 text-control font-medium text-foreground outline-hidden select-none focus:bg-mint-soft data-highlighted:bg-mint-soft data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

/** Sidebar / account-menu rows: shorter hit target, popover ink, 16px icons. */
export const compactMenuItemClass =
	'h-9 gap-2 rounded-sm px-2 text-[13px] font-medium text-popover-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';

export const menuItemDestructiveClass =
	'data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive';

export const menuIndicatorItemClass =
	"relative flex cursor-default items-center gap-1.5 rounded-sm py-2 pr-8 pl-[11px] text-control font-medium text-foreground outline-hidden select-none focus:bg-mint-soft data-highlighted:bg-mint-soft data-[state=checked]:font-bold data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

export const menuSubTriggerClass =
	"flex cursor-default items-center gap-1.5 rounded-sm px-[11px] py-2 text-control font-medium text-foreground outline-hidden select-none focus:bg-mint-soft data-highlighted:bg-mint-soft data-inset:pl-7 data-[state=open]:bg-mint-soft data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

export const menuGroupHeadingClass =
	'text-muted-foreground px-2.5 pt-2.5 pb-1 text-micro font-extrabold tracking-[0.06em] uppercase';

export const commandItemClass =
	"group/command-item data-selected:bg-mint-soft data-selected:text-foreground data-selected:*:[svg]:text-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2.5 py-[9px] text-control font-medium outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const calendarNavButtonClass =
	'border-border text-muted-foreground lip-static hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded-sm border-2 bg-transparent p-0 transition-all outline-none select-none focus-visible:ring-3 active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-50 rtl:rotate-180';

export const selectItemClass =
	"relative flex w-full cursor-default items-center gap-1.5 rounded-sm py-2 pr-8 pl-[11px] text-control font-medium text-foreground outline-hidden select-none focus:bg-mint-soft data-highlighted:bg-mint-soft data-selected:font-bold data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2";

export const menuIndicatorIconClass = 'text-mint-foreground pointer-events-none';
