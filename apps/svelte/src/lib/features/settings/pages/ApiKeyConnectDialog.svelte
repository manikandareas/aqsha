<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { readableApiErrorMessage } from '$lib/errors';
	import { type IntegrationProviderKey, PROVIDER_META } from '../lib/integrations';
	import { useConnectApiKeyIntegration } from '../api';

	/**
	 * Connect via API key (Zotero — no OAuth). Port 1:1 from the ApiKeyConnectDialog in
	 * apps/web/features/settings/components/integrations-page.tsx. Key validated server-side against
	 * Zotero before being stored encrypted; the secret never persists in client state after submit.
	 */
	let {
		provider,
		open,
		onOpenChange
	}: {
		provider: IntegrationProviderKey;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	} = $props();

	const meta = $derived(PROVIDER_META[provider]);
	const connectKey = useConnectApiKeyIntegration();
	let apiKey = $state('');
	let userId = $state('');
	let error = $state<string | null>(null);

	async function submit() {
		error = null;
		if (!apiKey.trim()) {
			error = 'API key wajib diisi.';
			return;
		}
		try {
			await connectKey.mutateAsync({
				provider,
				apiKey: apiKey.trim(),
				userId: userId.trim() || undefined
			});
			apiKey = '';
			userId = '';
			onOpenChange(false);
		} catch (err) {
			error = readableApiErrorMessage(err, 'Gagal menghubungkan akun.');
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Hubungkan {meta.label}</Dialog.Title>
			<Dialog.Description>
				Tempel API key {meta.label} kamu. Buat key dengan akses baca di
				<a
					href={meta.helpUrl}
					target="_blank"
					rel="noreferrer"
					class="underline underline-offset-2"
				>
					pengaturan {meta.label}
				</a>.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-3">
			<label class="grid gap-1.5">
				<span class="text-[12px] font-semibold text-foreground">API key</span>
				<Input
					value={apiKey}
					oninput={(event) => (apiKey = (event.currentTarget as HTMLInputElement).value)}
					placeholder="Contoh: P9NiFoyLeZu2bZNvvuQPDWsd"
					autocomplete="off"
					{@attach (node) => node.focus()}
				/>
			</label>
			<label class="grid gap-1.5">
				<span class="text-[12px] font-semibold text-foreground">
					User ID <span class="font-normal text-muted-foreground">(opsional)</span>
				</span>
				<Input
					value={userId}
					oninput={(event) => (userId = (event.currentTarget as HTMLInputElement).value)}
					placeholder="Terdeteksi otomatis dari API key"
					autocomplete="off"
				/>
			</label>
			{#if error}
				<p class="text-[12px] font-medium text-destructive">{error}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)}>Batal</Button>
			<Button type="button" onclick={submit} disabled={connectKey.isPending}>
				{connectKey.isPending ? 'Menghubungkan…' : 'Hubungkan'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
