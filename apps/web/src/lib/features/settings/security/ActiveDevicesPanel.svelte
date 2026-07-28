<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import { Icon, Loader2Icon, LogOutIcon } from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { useRevokeSession, useSessions } from '../api';
	import {
		SettingsPanel,
		SettingsPanelHeader,
		SettingsPill,
		SettingsRow
	} from '../components/settings-card';

	const auth = getAuthState();
	const sessions = useSessions(() => auth.isSignedIn);
	const revoke = useRevokeSession();

	const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
	const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 31_536_000_000],
		['month', 2_592_000_000],
		['day', 86_400_000],
		['hour', 3_600_000],
		['minute', 60_000]
	];

	function relativeTime(ms: number): string {
		const diff = ms - Date.now();
		for (const [unit, size] of UNITS) {
			if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit);
		}
		return 'baru saja';
	}
</script>

<SettingsPanel>
	<SettingsPanelHeader
		title="Perangkat aktif"
		description="Perangkat yang sedang masuk ke akun kamu. Keluarkan perangkat yang tidak kamu kenali."
	/>
	{#if sessions.isPending}
		<div class="divide-y divide-border/60">
			{#each [0, 1] as i (i)}
				<div class="px-5 py-4 sm:px-6">
					<Skeleton class="h-4 w-40" />
					<Skeleton class="mt-2 h-3 w-56" />
				</div>
			{/each}
		</div>
	{:else if sessions.isError}
		<div class="px-5 py-6 text-[13px] text-muted-foreground sm:px-6">
			Gagal memuat perangkat aktif.
		</div>
	{:else if !sessions.data || sessions.data.length === 0}
		<div class="px-5 py-6 text-[13px] text-muted-foreground sm:px-6">
			Tidak ada perangkat aktif.
		</div>
	{:else}
		<div class="divide-y divide-border/60">
			{#each sessions.data as s (s.id)}
				{@const location = [s.city, s.country].filter(Boolean).join(', ')}
				{@const meta = [location || s.ipAddress, `Terakhir aktif ${relativeTime(s.lastActiveAt)}`]
					.filter(Boolean)
					.join(' · ')}
				{@const revoking = revoke.isPending && revoke.variables === s.id}
				<SettingsRow label={s.browser ?? s.device ?? 'Perangkat tak dikenal'} description={meta}>
					{#if s.isCurrent}
						<SettingsPill class="text-foreground">Perangkat ini</SettingsPill>
					{:else}
						<Button
							variant="outline"
							size="sm"
							disabled={revoking}
							onclick={() => revoke.mutate(s.id)}
						>
							{#if revoking}
								<Icon icon={Loader2Icon} class="size-4 animate-spin" />
							{:else}
								<Icon icon={LogOutIcon} class="size-4" />
							{/if}
							Keluar
						</Button>
					{/if}
				</SettingsRow>
			{/each}
		</div>
	{/if}
</SettingsPanel>
