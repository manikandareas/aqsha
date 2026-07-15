<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Icon, ArrowUpRightIcon } from '$lib/icons';
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

	const billing = useBillingCurrent();
	const usage = useUsageActivity(() => 365);
	const profile = useProfile();
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
			<p class="text-[13px] text-muted-foreground">Memuat billing…</p>
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
			<p class="text-[13px] text-muted-foreground">Memuat penggunaan…</p>
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
