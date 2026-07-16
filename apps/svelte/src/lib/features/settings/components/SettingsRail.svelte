<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import NavUser from '$lib/components/layout/NavUser.svelte';
	import { Icon, ArrowLeftIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { settingsItemForPath, settingsMenu, type SettingsMenuItem } from '../lib/settings-menu';

	/**
	 * Settings navigation rail. Offcanvas + flush variant (distinct from the product AppSidebar),
	 * "Kembali ke chat" header, two nav groups (Pribadi / Riset), NavUser footer (viewer resolves from
	 * `viewerContext`). Active section derives from the current pathname.
	 */
	const active = $derived(settingsItemForPath(page.url.pathname).key);

	const settingsItemBaseClass =
		'h-8 gap-2 rounded-[8px] px-2.5 py-0 text-[12px] font-medium transition-[background-color,color] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5';

	function settingsItemClass(isActive: boolean) {
		return cn(
			settingsItemBaseClass,
			isActive
				? 'bg-primary/10 text-foreground [&_svg]:text-primary'
				: 'text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-primary/70'
		);
	}
</script>

{#snippet navRow(item: SettingsMenuItem, isActive: boolean)}
	<Sidebar.MenuItem class="min-w-0 overflow-hidden">
		<Sidebar.MenuButton {isActive} class={settingsItemClass(isActive)}>
			{#snippet child({ props })}
				<a href={item.href} {...props}>
					<Icon icon={item.icon} />
					<span>{item.label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
{/snippet}

{#snippet navGroup(label: SettingsMenuItem['group'])}
	<div class="min-w-0 overflow-hidden">
		<div class="flex items-center justify-between gap-1 px-0.5 pb-1.5 pt-0">
			<span class="text-[11px] font-medium tracking-[-0.01em] text-primary/75">{label}</span>
		</div>
		<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
			{#each settingsMenu.filter((item) => item.group === label) as item (item.key)}
				{@render navRow(item, active === item.key)}
			{/each}
		</Sidebar.Menu>
	</div>
{/snippet}

<Sidebar.Root collapsible="offcanvas" variant="flush">
	<Sidebar.Header class="gap-3 px-3 pb-3 pt-3.5">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					class={cn(settingsItemBaseClass, 'text-muted-foreground hover:text-foreground')}
				>
					{#snippet child({ props })}
						<a href={resolve('/app')} {...props}>
							<Icon icon={ArrowLeftIcon} class="size-3.5" />
							<span>Kembali ke chat</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="min-h-0 px-3 pb-3 pt-0">
		<div class="grid gap-5">
			{@render navGroup('Pribadi')}
			{@render navGroup('Riset')}
		</div>
	</Sidebar.Content>

	<Sidebar.Footer class="mt-auto p-3">
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
