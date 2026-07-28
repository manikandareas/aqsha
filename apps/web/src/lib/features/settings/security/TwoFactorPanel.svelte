<script lang="ts">
	import QR from '@svelte-put/qr/svg/QR.svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, CopyIcon, DownloadIcon, Loader2Icon } from '$lib/icons';
	import { getClerkUser, getReverification } from '$lib/auth';
	import { clerkErrorMessage } from './clerk-error';
	import {
		SettingsPanel,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsPill
	} from '../components/settings-card';

	/**
	 * TOTP two-factor via authenticator app. Enrollment runs through Clerk's client SDK — the backend
	 * has no generate-secret + verify endpoint. Flow: createTOTP → scan QR / manual entry → verifyTOTP
	 * → backup codes. Sensitive ops wrapped in `reverify`. Disable via disableTOTP. Status from
	 * `user.totpEnabled`.
	 *
	 * NOTE: not mounted in SecurityPage yet (kept ready for re-enable).
	 */
	const clerkUser = getClerkUser();
	const reverify = getReverification();

	const enabled = $derived(Boolean(clerkUser.user?.totpEnabled));

	let enrollOpen = $state(false);
	let step = $state<'scan' | 'backup'>('scan');
	let totp = $state<{ uri: string | null; secret: string | null }>({ uri: null, secret: null });
	let code = $state('');
	let codes = $state<string[]>([]);
	let busy = $state(false);
	let disableOpen = $state(false);

	async function copyText(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Disalin.');
		} catch {
			toast.error('Gagal menyalin.');
		}
	}

	function downloadCodes(list: string[]) {
		const blob = new Blob([list.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'aqsha-backup-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	}

	function resetEnroll() {
		step = 'scan';
		totp = { uri: null, secret: null };
		code = '';
		codes = [];
		busy = false;
	}

	async function startEnroll() {
		const user = clerkUser.user;
		if (!user) return;
		busy = true;
		try {
			// createTOTP() triggers Clerk's reverification modal (if needed). Run it FIRST — so Clerk's
			// modal shows alone — then open our QR dialog once the secret is ready (avoids both showing).
			const res = await reverify(() => user.createTOTP());
			totp = { uri: res?.uri ?? null, secret: res?.secret ?? null };
			enrollOpen = true;
		} catch (err) {
			toast.error(clerkErrorMessage(err, 'Gagal memulai aktivasi 2FA.'));
		} finally {
			busy = false;
		}
	}

	async function verify() {
		const user = clerkUser.user;
		if (!user || code.trim().length === 0) return;
		busy = true;
		try {
			await reverify(() => user.verifyTOTP({ code: code.trim() }));
			const backup = await reverify(() => user.createBackupCode());
			codes = backup?.codes ?? [];
			step = 'backup';
		} catch (err) {
			toast.error(clerkErrorMessage(err, 'Kode tidak valid. Coba lagi.'));
		} finally {
			busy = false;
		}
	}

	function finishEnroll() {
		enrollOpen = false;
		resetEnroll();
		toast.success('Verifikasi dua langkah aktif.');
	}

	async function disable() {
		const user = clerkUser.user;
		if (!user) return;
		// Close our confirm dialog FIRST → Clerk's reverification modal shows alone.
		disableOpen = false;
		busy = true;
		try {
			await reverify(() => user.disableTOTP());
			toast.success('Verifikasi dua langkah dinonaktifkan.');
		} catch (err) {
			toast.error(clerkErrorMessage(err, 'Gagal menonaktifkan 2FA.'));
		} finally {
			busy = false;
		}
	}
</script>

<SettingsPanel>
	<SettingsPanelHeader
		title="Verifikasi dua langkah"
		description="Tambahkan aplikasi autentikator (Google Authenticator, Authy, 1Password) sebagai lapisan keamanan kedua saat login."
	>
		{#snippet action()}
			{#if enabled}
				<SettingsPill class="text-foreground">Aktif</SettingsPill>
			{/if}
		{/snippet}
	</SettingsPanelHeader>
	<SettingsPanelFooter class="justify-end">
		{#if enabled}
			<Dialog.Root open={disableOpen} onOpenChange={(o) => (disableOpen = o)}>
				<Button variant="outline" size="sm" onclick={() => (disableOpen = true)}>Nonaktifkan</Button
				>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Nonaktifkan verifikasi dua langkah?</Dialog.Title>
						<Dialog.Description>
							Akun kamu hanya akan terlindungi kata sandi. Kamu bisa mengaktifkannya lagi kapan
							saja.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Dialog.Close>
							{#snippet child({ props })}
								<Button variant="outline" size="sm" disabled={busy} {...props}>Batal</Button>
							{/snippet}
						</Dialog.Close>
						<Button variant="destructive" size="sm" disabled={busy} onclick={disable}>
							{#if busy}
								<Icon icon={Loader2Icon} class="size-4 animate-spin" />
							{/if}
							Nonaktifkan
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		{:else}
			<Button size="sm" disabled={!clerkUser.isLoaded || busy} onclick={startEnroll}>
				{#if busy}
					<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				{/if}
				Aktifkan
			</Button>
		{/if}
	</SettingsPanelFooter>

	<!-- Dialog enrollment (scan → verify → backup codes) -->
	<Dialog.Root
		open={enrollOpen}
		onOpenChange={(open) => {
			enrollOpen = open;
			if (!open) resetEnroll();
		}}
	>
		<Dialog.Content class="sm:max-w-md">
			{#if step === 'scan'}
				<Dialog.Header>
					<Dialog.Title>Pindai kode QR</Dialog.Title>
					<Dialog.Description>
						Pindai dengan aplikasi autentikator, lalu masukkan kode 6 digit yang muncul.
					</Dialog.Description>
				</Dialog.Header>
				<div class="flex flex-col items-center gap-4">
					{#if totp.uri}
						<div class="rounded-lg border border-border/70 bg-white p-3">
							<QR data={totp.uri} width={160} height={160} />
						</div>
					{/if}
					{#if totp.secret}
						<button
							type="button"
							onclick={() => copyText(totp.secret as string)}
							class="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground"
						>
							<Icon icon={CopyIcon} class="size-3.5" />
							{totp.secret}
						</button>
					{/if}
					<Input
						inputmode="numeric"
						autocomplete="one-time-code"
						placeholder="123456"
						value={code}
						oninput={(event) => (code = (event.currentTarget as HTMLInputElement).value)}
						disabled={busy || !totp.uri}
						class="max-w-[12rem] text-center tracking-widest"
					/>
				</div>
				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" disabled={busy} {...props}>Batal</Button>
						{/snippet}
					</Dialog.Close>
					<Button
						size="sm"
						disabled={busy || !totp.uri || code.trim().length === 0}
						onclick={verify}
					>
						{#if busy}
							<Icon icon={Loader2Icon} class="size-4 animate-spin" />
						{/if}
						Verifikasi
					</Button>
				</Dialog.Footer>
			{:else}
				<Dialog.Header>
					<Dialog.Title>Simpan kode cadangan</Dialog.Title>
					<Dialog.Description>
						Gunakan kode ini untuk masuk jika kehilangan akses ke aplikasi autentikator. Setiap kode
						hanya dipakai sekali.
					</Dialog.Description>
				</Dialog.Header>
				<div
					class="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 font-mono text-[13px]"
				>
					{#each codes as c (c)}
						<span class="text-center">{c}</span>
					{/each}
				</div>
				<Dialog.Footer class="sm:justify-between">
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => copyText(codes.join('\n'))}>
							<Icon icon={CopyIcon} class="size-4" />
							Salin
						</Button>
						<Button variant="outline" size="sm" onclick={() => downloadCodes(codes)}>
							<Icon icon={DownloadIcon} class="size-4" />
							Unduh
						</Button>
					</div>
					<Button size="sm" onclick={finishEnroll}>Selesai</Button>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</SettingsPanel>
