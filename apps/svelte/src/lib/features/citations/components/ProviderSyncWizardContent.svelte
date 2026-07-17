<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { useIntegrations } from '$lib/features/settings/api';
	import type { IntegrationProviderKey } from '$lib/features/settings/lib/integrations';
	import ProviderSyncFlow from './ProviderSyncFlow.svelte';

	let {
		onOpenChange,
		onDone
	}: {
		onOpenChange: (open: boolean) => void;
		onDone: () => void;
	} = $props();

	const integrations = useIntegrations();
	const connected = $derived(
		(integrations.data ?? []).filter((i) => i.available && i.status === 'connected')
	);
	let provider = $state<IntegrationProviderKey | null>(null);
	const activeProvider = $derived(provider ?? connected[0]?.provider ?? null);
</script>

{#if integrations.isLoading}
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Tarik dari provider</Dialog.Title>
		</Dialog.Header>
		<p class="py-6 text-center text-[13px] font-medium text-muted-foreground">Memuat koneksi…</p>
	</Dialog.Content>
{:else if !activeProvider}
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Belum ada akun terhubung</Dialog.Title>
			<Dialog.Description>
				Hubungkan akun Mendeley atau Zotero terlebih dahulu untuk menarik referensi.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)}>Tutup</Button>
			<Button href="/app/settings/integrations">Buka Pengaturan → Integrasi</Button>
		</Dialog.Footer>
	</Dialog.Content>
{:else}
	<ProviderSyncFlow
		provider={activeProvider}
		providers={connected.map((c) => c.provider)}
		onProviderChange={(p) => (provider = p)}
		{onOpenChange}
		{onDone}
	/>
{/if}
