<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { PageTitle } from '$lib/seo';
	import { settingsItemForPath } from '$lib/features/settings/lib/settings-menu';
	import SettingsShell from '$lib/features/settings/components/SettingsShell.svelte';

	/**
	 * Console-group layout — SettingsShell for `/app/settings/*`. The `(console)` route group is
	 * URL-transparent and sits as a sibling of `(product)` under `/app`: both are named chrome groups,
	 * but `(console)` renders SettingsShell (settings rail) directly under the root layout instead of
	 * AppShell. Auth + onboarding gating already ran in `hooks.server.ts`.
	 */
	let { children }: { children: Snippet } = $props();

	// One `<title>` for all 7 settings routes, derived from the active rail item (e.g. "Akun ·
	// Pengaturan"). Set at the layout level so each `+page.svelte` stays title-free; the label matches
	// the visible nav + SettingsShell "Pengaturan" header.
	const settingsTitle = $derived(`${settingsItemForPath(page.url.pathname).label} · Pengaturan`);
</script>

<PageTitle title={settingsTitle} />

<SettingsShell>
	{@render children()}
</SettingsShell>
