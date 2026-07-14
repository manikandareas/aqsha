<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Icon, SunIcon, MoonIcon, MonitorIcon, CheckIcon } from '$lib/icons';
	import type { IconSvgElement } from '$lib/icons';
	import { themeContext, type ThemeMode } from '$lib/theme';
	import { cn } from '$lib/utils';

	/**
	 * Theme submenu inside the user dropdown — ported 1:1 from
	 * apps/web/components/theme-toggle.tsx (`ThemeMenuSub`). next-themes' `theme`/`setTheme`
	 * → the `$lib/theme` seam (mode-watcher). Light/Dark/System, active row checked.
	 */
	let { class: className }: { class?: string } = $props();

	const theme = themeContext.get();

	const themeOptions = [
		{ key: 'light', label: 'Light', icon: SunIcon },
		{ key: 'dark', label: 'Dark', icon: MoonIcon },
		{ key: 'system', label: 'System', icon: MonitorIcon }
	] as const satisfies ReadonlyArray<{ key: ThemeMode; label: string; icon: IconSvgElement }>;

	const themeMenuItemClass =
		'h-9 gap-2 rounded-[8px] px-2 text-[13px] font-medium text-popover-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';

	const current = $derived(theme.preference);
	const currentIcon = $derived(
		(themeOptions.find((option) => option.key === current) ?? themeOptions[2]).icon
	);
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger
		class={cn(themeMenuItemClass, 'w-full cursor-default [&>svg:last-child]:hidden', className)}
	>
		<Icon icon={currentIcon} />
		<span class="truncate">Theme</span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent class="min-w-36 rounded-[12px] p-1.5">
		{#each themeOptions as option (option.key)}
			{@const active = current === option.key}
			<DropdownMenu.Item class={themeMenuItemClass} onSelect={() => theme.setMode(option.key)}>
				<Icon icon={option.icon} class={cn(active && 'text-primary')} />
				<span class={cn('truncate', active && 'font-semibold text-primary')}>{option.label}</span>
				{#if active}
					<Icon icon={CheckIcon} class="ml-auto size-3.5 text-primary" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
