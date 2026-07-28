<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { untrack } from 'svelte';
	import { apiErrorCode, readableApiErrorMessage } from '$lib/errors';

	let {
		onOpenChange,
		onSubmit,
		prefill = null
	}: {
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { doi: string; allowDuplicate?: boolean }) => Promise<unknown>;
		/** DOI yang sudah terbaca dari clipboard; pengguna tetap bisa menyuntingnya. */
		prefill?: string | null;
	} = $props();

	// Sengaja hanya nilai awal: konten dialog di-mount ulang setiap kali dibuka, dan
	// sesudahnya input adalah milik pengguna — prefill tak boleh menimpa suntingannya.
	let doi = $state(untrack(() => prefill) ?? '');
	let pending = $state(false);
	let error = $state<string | null>(null);
	let duplicateBlocked = $state(false);

	async function submit(allowDuplicate: boolean) {
		if (!doi.trim() || pending) return;
		pending = true;
		error = null;
		try {
			await onSubmit({ doi: doi.trim(), ...(allowDuplicate ? { allowDuplicate } : {}) });
			onOpenChange(false);
		} catch (err) {
			if (apiErrorCode(err) === 'citation_duplicate') duplicateBlocked = true;
			error = readableApiErrorMessage(err, 'Gagal menambahkan referensi dari DOI');
		} finally {
			pending = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void submit(false);
	}
</script>

<Dialog.Content class="sm:max-w-sm">
	<Dialog.Header>
		<Dialog.Title>Tambah dari DOI</Dialog.Title>
		<Dialog.Description>
			Tempel DOI (mis. 10.1038/nature14539) — metadata diambil otomatis dari Crossref/OpenAlex.
		</Dialog.Description>
	</Dialog.Header>
	<form class="grid gap-3" onsubmit={handleSubmit}>
		<Input
			placeholder="10.xxxx/xxxxx atau https://doi.org/…"
			value={doi}
			oninput={(event) => {
				doi = (event.currentTarget as HTMLInputElement).value;
				duplicateBlocked = false;
			}}
			{@attach (node) => node.focus()}
		/>
		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)} disabled={pending}>
				Batal
			</Button>
			{#if duplicateBlocked}
				<Button type="button" variant="secondary" disabled={pending} onclick={() => submit(true)}>
					Tambah tetap
				</Button>
			{/if}
			<Button type="submit" disabled={!doi.trim() || pending}>
				{pending ? 'Mencari…' : 'Tambah'}
			</Button>
		</Dialog.Footer>
	</form>
</Dialog.Content>
