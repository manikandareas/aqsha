<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, Loader2Icon, Trash2Icon } from '$lib/icons';
	import { getSignOut } from '$lib/auth';
	import { useDeleteAccount, useProfile, useUpdateDisplayName } from '../api';
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import {
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsRow
	} from '../components/settings-card';

	const profile = useProfile();
	const update = useUpdateDisplayName();
	const del = useDeleteAccount(getSignOut());

	let name = $state<string | null>(null);
	let confirm = $state('');
	let deleteOpen = $state(false);
	const canDelete = $derived(confirm.trim() === 'HAPUS');

	function onDeleteOpenChange(open: boolean) {
		deleteOpen = open;
		if (!open) confirm = '';
	}

	// Initialise the field from the profile once data arrives (derived, not effect).
	const value = $derived(name ?? profile.data?.name ?? '');
	const dirty = $derived(name !== null && name.trim() !== (profile.data?.name ?? ''));

	function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		update.mutate(trimmed);
	}
</script>

<SettingsHeader section="account" title="Akun" description="Kelola profil dan identitas kamu." />

<SettingsPanel>
	<SettingsPanelHeader title="Nama tampilan" description="Nama yang muncul di seluruh aplikasi." />
	<form onsubmit={onSubmit}>
		<SettingsPanelBody>
			<Input
				{value}
				oninput={(event) => (name = (event.currentTarget as HTMLInputElement).value)}
				maxlength={120}
				placeholder="Nama kamu"
				disabled={profile.isPending || update.isPending}
				class="max-w-md"
			/>
		</SettingsPanelBody>
		<SettingsPanelFooter class="justify-end">
			<Button type="submit" size="sm" disabled={!dirty || !value.trim() || update.isPending}>
				{#if update.isPending}
					<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				{/if}
				Simpan
			</Button>
		</SettingsPanelFooter>
	</form>
</SettingsPanel>

<SettingsPanel>
	<SettingsPanelHeader title="Detail akun" description="Email dan foto profil kamu." />
	<div class="divide-y divide-border/60">
		<SettingsRow label="Email">
			<span class="text-muted-foreground">{profile.data?.email ?? '—'}</span>
		</SettingsRow>
		<SettingsRow label="Foto profil" description="Ubah di menu profil pojok aplikasi." />
	</div>
</SettingsPanel>

<SettingsPanel class="border-destructive/30">
	<SettingsPanelHeader
		title="Hapus akun"
		description="Menghapus permanen seluruh data kamu (workspace, artifact, chat, feed, billing). Tindakan ini tidak bisa dibatalkan."
		class="border-destructive/20"
	/>
	<SettingsPanelFooter class="justify-end border-destructive/20 bg-destructive/[0.03]">
		<Dialog.Root open={deleteOpen} onOpenChange={onDeleteOpenChange}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button variant="destructive" size="sm" disabled={del.isPending} {...props}>
						<Icon icon={Trash2Icon} class="size-4" />
						Hapus akun saya
					</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-md">
				<Dialog.Header>
					<Dialog.Title>Hapus akun permanen?</Dialog.Title>
					<Dialog.Description>
						Menghapus seluruh data kamu (workspace, artifact, chat, feed, billing). Tindakan ini
						tidak bisa dibatalkan.
					</Dialog.Description>
				</Dialog.Header>
				<div class="grid gap-2">
					<label for="confirm-delete" class="text-[13px] font-medium text-foreground">
						Ketik <span class="font-semibold">HAPUS</span> untuk konfirmasi
					</label>
					<Input
						id="confirm-delete"
						value={confirm}
						oninput={(event) => (confirm = (event.currentTarget as HTMLInputElement).value)}
						placeholder="HAPUS"
						disabled={del.isPending}
						{@attach (node) => node.focus()}
					/>
				</div>
				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" disabled={del.isPending} {...props}>Batal</Button>
						{/snippet}
					</Dialog.Close>
					<Button
						variant="destructive"
						size="sm"
						disabled={!canDelete || del.isPending}
						onclick={() => del.mutate()}
					>
						{#if del.isPending}
							<Icon icon={Loader2Icon} class="size-4 animate-spin" />
						{:else}
							<Icon icon={Trash2Icon} class="size-4" />
						{/if}
						Hapus permanen
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</SettingsPanelFooter>
</SettingsPanel>
