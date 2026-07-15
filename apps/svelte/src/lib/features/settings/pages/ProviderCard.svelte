<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Icon, RotateCcwIcon } from '$lib/icons';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import {
		type IntegrationProviderKey,
		type IntegrationStatusView,
		INTEGRATION_STATUS_LABELS,
		PROVIDER_AUTH_MODE,
		PROVIDER_META
	} from '../lib/integrations';
	import { useConnectIntegration, useDisconnectIntegration, useRefreshIntegration } from '../api';
	import ApiKeyConnectDialog from './ApiKeyConnectDialog.svelte';
	import {
		SettingsPanel,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsPill,
		SettingsRow
	} from '../components/settings-card';

	let {
		provider,
		status,
		loading
	}: {
		provider: IntegrationProviderKey;
		status: IntegrationStatusView | null;
		loading: boolean;
	} = $props();

	const meta = $derived(PROVIDER_META[provider]);
	const connect = useConnectIntegration();
	const disconnect = useDisconnectIntegration();
	const refresh = useRefreshIntegration();
	let confirmDisconnect = $state(false);
	let keyDialogOpen = $state(false);

	const available = $derived(status?.available ?? true);
	const authMode = $derived(status?.authMode ?? PROVIDER_AUTH_MODE[provider]);
	const configured = $derived(status?.configured ?? false);
	const connected = $derived(status?.status === 'connected');
	const needsAttention = $derived(status?.status === 'expired' || status?.status === 'error');

	function formatSyncTime(ms: number | null): string {
		if (!ms) return 'Belum pernah';
		return new Date(ms).toLocaleString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function statusPill(s: IntegrationStatusView | null, isAvailable: boolean): string {
		if (!isAvailable) return 'Segera';
		if (!s || s.status === 'disconnected') return INTEGRATION_STATUS_LABELS.disconnected;
		return INTEGRATION_STATUS_LABELS[s.status];
	}
</script>

<SettingsPanel>
	<SettingsPanelHeader title={meta.label} description={meta.description}>
		{#snippet action()}
			<SettingsPill
				class={connected
					? 'border-mint/40 bg-mint-soft text-mint-foreground'
					: needsAttention
						? 'border-amber-300/50 bg-amber-50 text-amber-700'
						: ''}
			>
				{statusPill(status, available)}
			</SettingsPill>
		{/snippet}
	</SettingsPanelHeader>

	{#if connected}
		<div class="divide-y divide-border/60">
			<SettingsRow label="Akun">
				<span class="text-muted-foreground">
					{status?.profile?.name ?? status?.profile?.email ?? 'Terhubung'}
				</span>
			</SettingsRow>
			<SettingsRow
				label="Cakupan"
				description="Aqsha hanya menarik metadata referensi, bukan file PDF."
			>
				<span class="text-muted-foreground">Metadata saja</span>
			</SettingsRow>
			<SettingsRow label="Sinkron terakhir">
				<span class="text-muted-foreground">{formatSyncTime(status?.lastSyncAt ?? null)}</span>
			</SettingsRow>
		</div>
	{:else if needsAttention && status?.lastError}
		<div class="divide-y divide-border/60">
			<SettingsRow label="Status" description={status.lastError}>
				<span class="text-amber-700">Perlu dihubungkan ulang</span>
			</SettingsRow>
		</div>
	{/if}

	<SettingsPanelFooter class="justify-end">
		{#if !available}
			<span class="text-[12px] text-muted-foreground">Integrasi {meta.label} segera hadir.</span>
		{:else if !configured}
			<span class="text-[12px] text-muted-foreground">Belum dikonfigurasi di server.</span>
		{:else if connected}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				disabled={refresh.isPending}
				onclick={() => refresh.mutate(provider)}
			>
				<Icon icon={RotateCcwIcon} class="size-3.5" />
				{refresh.isPending ? 'Menyinkronkan…' : 'Sinkronkan sekarang'}
			</Button>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				class="text-destructive hover:text-destructive"
				onclick={() => (confirmDisconnect = true)}
			>
				Putuskan
			</Button>
		{:else}
			<Button
				type="button"
				size="sm"
				disabled={loading || connect.isPending}
				onclick={() => (authMode === 'api_key' ? (keyDialogOpen = true) : connect.mutate(provider))}
			>
				{needsAttention ? 'Hubungkan ulang' : 'Hubungkan'}
			</Button>
		{/if}
	</SettingsPanelFooter>

	{#if authMode === 'api_key'}
		<ApiKeyConnectDialog
			{provider}
			open={keyDialogOpen}
			onOpenChange={(o) => (keyDialogOpen = o)}
		/>
	{/if}

	<ConfirmDialog
		open={confirmDisconnect}
		onOpenChange={(o) => (confirmDisconnect = o)}
		title={`Putuskan ${meta.label}?`}
		description="Koneksi diputuskan dan token dihapus. Referensi yang sudah tersimpan di Aqsha tetap aman."
		confirmLabel="Putuskan"
		onConfirm={async () => {
			await disconnect.mutateAsync(provider);
			confirmDisconnect = false;
		}}
	/>
</SettingsPanel>
