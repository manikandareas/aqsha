<script lang="ts">
	import type { Snippet } from 'svelte';
	import SettingsShell from '$lib/features/settings/components/SettingsShell.svelte';

	/**
	 * Console-group layout — mirror web `app/app/settings/layout.tsx` (SettingsShell). The `(console)`
	 * route group is URL-transparent (`(console)/settings/*` still serves `/app/settings/*`) and sits
	 * as a sibling of `(product)` under `/app`: both are named chrome groups, but `(console)` renders
	 * its own SettingsShell (settings rail) directly under the root layout instead of the product
	 * AppShell. Auth + onboarding gating already ran in `hooks.server.ts` (Phase 2, FND-8).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<SettingsShell>
	{@render children()}
</SettingsShell>
