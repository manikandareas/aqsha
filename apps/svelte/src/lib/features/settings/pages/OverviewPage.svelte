<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import { Icon, ArrowUpRightIcon } from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { useBillingCurrent, useProfile, useUsageActivity } from '../api';
	import CreditMeter from '../components/CreditMeter.svelte';
	import UsageChart from '../components/UsageChart.svelte';
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import {
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsPill
	} from '../components/settings-card';

	const auth = getAuthState();
	const enabled = () => auth.isSignedIn;
	const billing = useBillingCurrent(enabled);
	const usage = useUsageActivity(() => 365, enabled);
	const profile = useProfile(enabled);
</script>

<SettingsHeader
	section="overview"
	title="Ringkasan"
	description={profile.data?.name
		? `Halo, ${profile.data.name} — pantau paket dan penggunaan kamu.`
		: 'Pantau paket dan penggunaan kamu.'}
/>

<SettingsPanel>
	<SettingsPanelHeader title="Paket aktif" description={billing.data?.planLabel ?? 'Memuat…'}>
		{#snippet action()}
			{#if billing.data}
				<SettingsPill>{billing.data.isAdmin ? 'Admin' : billing.data.status}</SettingsPill>
			{/if}
		{/snippet}
	</SettingsPanelHeader>
	<SettingsPanelBody>
		{#if billing.isPending}
			<!-- Mirror CreditMeter's shape so the loaded meter drops in without shifting the footer. -->
			<div class="space-y-3">
				<Skeleton class="h-8 w-32" />
				<Skeleton class="h-1.5 w-full" />
				<Skeleton class="h-3 w-40" />
			</div>
		{:else if billing.data}
			<CreditMeter
				creditsUsed={billing.data.creditsUsed}
				creditsLimit={billing.data.creditsLimit}
				creditsRemaining={billing.data.creditsRemaining}
				unlimited={billing.data.isUnlimitedCredits}
				resetAt={billing.data.resetAt}
			/>
		{:else}
			<p class="text-[13px] text-muted-foreground">Tidak dapat memuat billing.</p>
		{/if}
	</SettingsPanelBody>
	<SettingsPanelFooter>
		<Button href="/app/settings/usage-billing" variant="outline" size="sm">
			Kelola langganan
			<Icon icon={ArrowUpRightIcon} class="size-4" />
		</Button>
	</SettingsPanelFooter>
</SettingsPanel>

<SettingsPanel>
	<SettingsPanelHeader
		title="Penggunaan"
		description="Kredit terpakai per hari (365 hari terakhir)"
	/>
	<SettingsPanelBody>
		{#if usage.isPending}
			<!-- Mirror UsageChart's shape (h-28 bars + caption) to avoid a load-time jump. -->
			<div class="space-y-3">
				<Skeleton class="h-28 w-full" />
				<Skeleton class="h-3 w-48" />
			</div>
		{:else if usage.data}
			<UsageChart days={usage.data} />
		{:else}
			<p class="text-[13px] text-muted-foreground">Tidak dapat memuat penggunaan.</p>
		{/if}
	</SettingsPanelBody>
</SettingsPanel>

<SettingsPanel>
	<SettingsPanelHeader title="Percakapan" description="Total percakapan dengan Astra" />
	<SettingsPanelBody>
		<p class="font-heading text-[2rem] font-bold leading-none tabular-nums text-muted-foreground">
			—
		</p>
		<p class="mt-2 text-[12px] text-muted-foreground">Tersedia setelah chat Astra aktif.</p>
	</SettingsPanelBody>
</SettingsPanel>
