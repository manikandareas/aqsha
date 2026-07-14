<script lang="ts">
	import { settingsItemForPath, type SettingsKey } from '../lib/settings-menu';

	/**
	 * Page header (title + subtitle). Port from
	 * apps/web/features/settings/components/settings-header.tsx. `description === null` hides the
	 * subtitle; `undefined` falls back to the menu item's description.
	 */
	let {
		section,
		title,
		description
	}: { section: SettingsKey; title?: string; description?: string | null } = $props();

	const item = $derived(settingsItemForPath(`/app/settings/${section}`));
	const heading = $derived(title ?? item.label);
	const sub = $derived(description === undefined ? item.description : description);
</script>

<header class="mb-1">
	<h1 class="font-heading text-[1.75rem] font-bold tracking-tight text-foreground sm:text-[2rem]">
		{heading}
	</h1>
	{#if sub}
		<p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{sub}</p>
	{/if}
</header>
