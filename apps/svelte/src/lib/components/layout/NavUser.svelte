<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Avatar from '@aqsha/ui-svelte/components/avatar';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { compactMenuItemClass } from '@aqsha/ui-svelte/recipes';
	import ThemeMenuSub from './ThemeMenuSub.svelte';
	import { Icon, LogOutIcon, MoreVerticalIcon, SettingsIcon } from '$lib/icons';
	import { getSignOut, viewerContext } from '$lib/auth';

	/**
	 * User menu in the sidebar footer. Avatar trigger → dropdown with profile header, Settings
	 * link, theme submenu, sign out. Viewer display resolves from `viewerContext` (Clerk-backed);
	 * sign out uses the Clerk seam then re-runs load via `goto(..., { invalidateAll })`.
	 */
	const sidebar = Sidebar.useSidebar();
	const viewer = viewerContext.get();
	const display = $derived(viewer.display({ name: 'Aqsha user', email: 'Signed in' }));

	// Captured at init (getContext is init-only) so the handler reads a fresh, non-null clerk.
	const clerkSignOut = getSignOut();

	async function signOut() {
		await clerkSignOut();
		await goto(resolve('/(auth)/sign-in'), { invalidateAll: true });
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="h-10 min-w-0 rounded-sm border border-sidebar-border/70 bg-muted/15 p-2.5 text-muted-foreground transition-[background-color,border-color,color] duration-150 ease-out hover:border-primary/20 hover:bg-primary/5 hover:text-foreground data-[state=open]:border-primary/25 data-[state=open]:bg-primary/8 data-[state=open]:text-foreground"
					>
						<Avatar.Root class="size-6 shrink-0 rounded-full ring-1 ring-sky-soft-border">
							{#if display.image}
								<Avatar.Image src={display.image} alt={display.name} />
							{/if}
							<Avatar.Fallback
								class="rounded-full bg-sky-soft text-[10px] font-semibold text-sky-foreground"
							>
								{display.initials}
							</Avatar.Fallback>
						</Avatar.Root>
						<span class="min-w-0 flex-1 truncate text-left text-[12px] font-medium">
							{display.name}
						</span>
						<Icon icon={MoreVerticalIcon} class="size-3.5 shrink-0 text-muted-foreground" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-floating-anchor-width) min-w-64 rounded-md p-1.5"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-2 font-normal">
					<div class="flex min-w-0 items-center gap-2">
						<Avatar.Root class="size-8 rounded-full ring-1 ring-sky-soft-border">
							{#if display.image}
								<Avatar.Image src={display.image} alt={display.name} />
							{/if}
							<Avatar.Fallback
								class="rounded-full bg-sky-soft text-xs font-semibold text-sky-foreground"
							>
								{display.initials}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid min-w-0 gap-0.5">
							<span class="truncate text-[13px] font-semibold text-popover-foreground">
								{display.name}
							</span>
							<span class="truncate text-label font-medium text-muted-foreground">
								{display.email}
							</span>
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class={compactMenuItemClass}>
					{#snippet child({ props })}
						<a href={resolve('/app/settings/overview')} {...props}>
							<Icon icon={SettingsIcon} />
							<span class="truncate">Pengaturan</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<ThemeMenuSub />
				<DropdownMenu.Separator />
				<DropdownMenu.Item class={compactMenuItemClass} onSelect={signOut}>
					<Icon icon={LogOutIcon} />
					<span class="truncate">Sign out</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
