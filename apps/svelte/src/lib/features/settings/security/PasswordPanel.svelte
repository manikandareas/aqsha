<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Icon, Loader2Icon } from '$lib/icons';
	import { getClerkUser, getReverification } from '$lib/auth';
	import { clerkErrorMessage } from './clerk-error';
	import {
		SettingsField,
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader
	} from '../components/settings-card';

	/**
	 * Change/set a password via the Clerk frontend SDK (browser→Clerk directly, not our server).
	 * Sensitive action → wrapped in `reverify` (Clerk shows a step-up modal if required). OAuth-only
	 * accounts (`!passwordEnabled`) get the "set" mode without the current-password field.
	 */
	const clerkUser = getClerkUser();
	const reverify = getReverification();

	const hasPassword = $derived(Boolean(clerkUser.user?.passwordEnabled));

	let current = $state('');
	let next = $state('');
	let confirm = $state('');
	let submitting = $state(false);

	const canSubmit = $derived(
		clerkUser.isLoaded &&
			next.length > 0 &&
			confirm.length > 0 &&
			(!hasPassword || current.length > 0)
	);

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const user = clerkUser.user;
		if (!user) return;
		if (next !== confirm) {
			toast.error('Konfirmasi kata sandi tidak cocok.');
			return;
		}
		submitting = true;
		try {
			await reverify(() =>
				user.updatePassword(
					hasPassword
						? { currentPassword: current, newPassword: next, signOutOfOtherSessions: true }
						: { newPassword: next, signOutOfOtherSessions: true }
				)
			);
			current = '';
			next = '';
			confirm = '';
			toast.success(hasPassword ? 'Kata sandi diperbarui.' : 'Kata sandi dibuat.');
		} catch (err) {
			toast.error(clerkErrorMessage(err, 'Gagal memperbarui kata sandi.'));
		} finally {
			submitting = false;
		}
	}
</script>

<SettingsPanel>
	<SettingsPanelHeader
		title={hasPassword ? 'Kata sandi' : 'Atur kata sandi'}
		description={hasPassword
			? 'Ganti kata sandi. Perangkat lain akan keluar otomatis.'
			: 'Akun kamu masuk lewat penyedia eksternal. Tambah kata sandi untuk login langsung.'}
	/>
	<form onsubmit={onSubmit}>
		<SettingsPanelBody class="grid max-w-md gap-4">
			{#if hasPassword}
				<SettingsField label="Kata sandi saat ini">
					<Input
						type="password"
						autocomplete="current-password"
						value={current}
						oninput={(event) => (current = (event.currentTarget as HTMLInputElement).value)}
						disabled={submitting}
					/>
				</SettingsField>
			{/if}
			<SettingsField label="Kata sandi baru">
				<Input
					type="password"
					autocomplete="new-password"
					value={next}
					oninput={(event) => (next = (event.currentTarget as HTMLInputElement).value)}
					disabled={submitting}
				/>
			</SettingsField>
			<SettingsField label="Konfirmasi kata sandi baru">
				<Input
					type="password"
					autocomplete="new-password"
					value={confirm}
					oninput={(event) => (confirm = (event.currentTarget as HTMLInputElement).value)}
					disabled={submitting}
				/>
			</SettingsField>
		</SettingsPanelBody>
		<SettingsPanelFooter class="justify-end">
			<Button type="submit" size="sm" disabled={!canSubmit || submitting}>
				{#if submitting}
					<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				{/if}
				{hasPassword ? 'Simpan' : 'Atur kata sandi'}
			</Button>
		</SettingsPanelFooter>
	</form>
</SettingsPanel>
