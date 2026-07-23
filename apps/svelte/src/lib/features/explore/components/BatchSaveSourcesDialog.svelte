<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import * as Alert from '@aqsha/ui-svelte/components/alert';
	import { Icon, CheckCircle2Icon } from '$lib/icons';
	import { useBulkSaveSearchSources } from '$lib/features/citations/api';
	import type { BulkSearchSaveResult, SearchSourceInput } from '$lib/features/citations/types';

	/**
	 * Confirms one destination — the account library — for every selected source, then
	 * announces the exact partial-success outcome (e.g. "5 sumber tersimpan, 1 gagal").
	 * Individual per-row saves keep using `SaveSourceButton`'s own project picker.
	 */
	let {
		open = $bindable(false),
		sources,
		onSaved
	}: {
		open?: boolean;
		sources: SearchSourceInput[];
		onSaved?: () => void;
	} = $props();

	const save = useBulkSaveSearchSources();
	let result = $state<BulkSearchSaveResult | null>(null);

	$effect(() => {
		if (open) result = null;
	});

	function confirmSave(): void {
		save.mutate(sources, {
			onSuccess: (data) => {
				result = data;
			}
		});
	}

	function close(): void {
		open = false;
		if (result && result.saved > 0) onSaved?.();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Simpan {sources.length} sumber</Dialog.Title>
			{#if !result}
				<Dialog.Description>
					Semua sumber terpilih akan disimpan ke perpustakaan akunmu. Duplikat memakai referensi
					yang sudah ada.
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if result}
			<Alert.Root variant={result.failed > 0 ? 'lemon' : 'mint'}>
				<Icon icon={CheckCircle2Icon} />
				<Alert.Title>
					{result.saved} sumber tersimpan{result.failed > 0 ? `, ${result.failed} gagal` : ''}
				</Alert.Title>
				{#if result.failed > 0}
					<Alert.Description>
						Sumber yang gagal tetap ada di hasil pencarian — coba simpan satu per satu dari baris
						hasilnya.
					</Alert.Description>
				{/if}
			</Alert.Root>
			<Dialog.Footer>
				<Button type="button" onclick={close}>Selesai</Button>
			</Dialog.Footer>
		{:else}
			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={save.isPending}
					onclick={() => (open = false)}
				>
					Batal
				</Button>
				<Button type="button" disabled={save.isPending} onclick={confirmSave}>
					{save.isPending ? 'Menyimpan…' : 'Simpan ke perpustakaan'}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
