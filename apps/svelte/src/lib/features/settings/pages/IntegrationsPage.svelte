<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { useIntegrations } from '../api';
	import {
		INTEGRATION_ERROR_MESSAGES,
		type IntegrationProviderKey,
		PROVIDER_META
	} from '../lib/integrations';
	import ProviderCard from './ProviderCard.svelte';
	import SettingsHeader from '../components/SettingsHeader.svelte';

	/**
	 * Settings → Integrasi. Per-provider card: status + connect (OAuth redirect) / connect-with-key
	 * (Zotero) / disconnect / sync. Connection lifecycle is account-level; per-workspace data pulls live
	 * in the Sitasi tab.
	 */
	const integrations = useIntegrations();

	// Toast the OAuth callback result, then strip the query so it does not repeat on refresh.
	$effect(() => {
		const connected = page.url.searchParams.get('connected');
		const error = page.url.searchParams.get('error');
		if (!connected && !error) return;
		if (connected) {
			const label = PROVIDER_META[connected as IntegrationProviderKey]?.label ?? connected;
			toast.success(`${label} terhubung.`);
		} else if (error) {
			toast.error(INTEGRATION_ERROR_MESSAGES[error] ?? 'Koneksi gagal.');
		}
		void goto('/app/settings/integrations', {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});

	const KNOWN_PROVIDERS: IntegrationProviderKey[] = ['mendeley', 'zotero'];
	const byProvider = $derived(new Map((integrations.data ?? []).map((i) => [i.provider, i])));
</script>

<SettingsHeader section="integrations" />
{#each KNOWN_PROVIDERS as provider (provider)}
	<ProviderCard
		{provider}
		status={byProvider.get(provider) ?? null}
		loading={integrations.isLoading}
	/>
{/each}
