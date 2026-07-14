<script lang="ts">
	import type { Snippet } from 'svelte';
	import SettingsShell from '$lib/features/settings/components/SettingsShell.svelte';

	/**
	 * Settings layout — mirror web `app/app/settings/layout.tsx` (SettingsShell). Because `/app/settings`
	 * lives OUTSIDE the `(product)` group, it does NOT inherit the product AppShell; it renders in its own
	 * SettingsShell (settings rail) directly under the root layout. Auth + onboarding gating already ran
	 * in `hooks.server.ts` (Phase 2, FND-8).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<SettingsShell>
	{@render children()}
</SettingsShell>
