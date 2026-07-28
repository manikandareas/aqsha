<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import NavUser from '$lib/components/layout/NavUser.svelte';
	import SidebarSection from '$lib/components/layout/sidebar/SidebarSection.svelte';
	import { sidebarItemClass } from '$lib/components/layout/sidebar/sidebar-item-class';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import { settingsItemForPath, settingsMenu, type SettingsMenuItem } from '../lib/settings-menu';

	/**
	 * Settings navigation rail — same inset + icon-collapsible chrome as AppSidebar.
	 * Header: "Kembali ke beranda". Content: Pribadi / Riset via SidebarSection.
	 * Collapse stays on Sidebar.Rail (no header toggle). Active section from pathname;
	 * NavUser resolves from `viewerContext`.
	 */
	const sidebar = Sidebar.useSidebar();
	const active = $derived(settingsItemForPath(page.url.pathname).key);
	const collapsed = $derived(!sidebar.isMobile && sidebar.state === 'collapsed');
	const groups = ['Pribadi', 'Riset'] as const;
</script>

{#snippet navRow(item: SettingsMenuItem, isActive: boolean)}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton
			{isActive}
			size="rail"
			class={sidebarItemClass(isActive)}
			tooltipContent={item.label}
		>
			{#snippet child({ props })}
				<a href={item.href} {...props}>
					<Icon icon={item.icon} class="size-3.5 shrink-0 group-data-[collapsible=icon]:size-4" />
					<span>{item.label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

<Sidebar.Root collapsible="icon" variant="inset">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5 group-data-[collapsible=icon]:px-0">
		<Sidebar.Menu class="gap-1 group-data-[collapsible=icon]:items-center">
			<Sidebar.MenuItem class="min-w-0 overflow-hidden">
				<Sidebar.MenuButton
					size="rail"
					class={sidebarItemClass(false)}
					tooltipContent="Kembali ke beranda"
				>
					{#snippet child({ props })}
						<a {...props} href={resolve('/app/(product)')}>
							<Icon
								icon={ArrowLeftIcon}
								class="size-3.5 shrink-0 group-data-[collapsible=icon]:size-4"
							/>
							<span>Kembali ke beranda</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-2 group-data-[collapsible=icon]:px-0">
		{#if !collapsed}
			<div class="grid gap-4">
				{#each groups as group, index (group)}
					<SidebarSection label={group} first={index === 0}>
						<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
							{#each settingsMenu.filter((item) => item.group === group) as item (item.key)}
								{@render navRow(item, active === item.key)}
							{/each}
						</Sidebar.Menu>
					</SidebarSection>
				{/each}
			</div>
		{:else}
			<!-- Icon rail: section labels hide; keep every settings destination as a tooltip'd glyph. -->
			<Sidebar.Menu class="gap-1 group-data-[collapsible=icon]:items-center">
				{#each settingsMenu as item (item.key)}
					{@render navRow(item, active === item.key)}
				{/each}
			</Sidebar.Menu>
		{/if}
	</Sidebar.Content>

	<Sidebar.Footer class="mt-auto gap-3 p-3 group-data-[collapsible=icon]:p-2">
		<NavUser />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
