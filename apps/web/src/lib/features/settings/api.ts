import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { getApiClient } from '$lib/api';
import { readableApiErrorMessage } from '$lib/errors';
import { queryKeys, unwrap } from '$lib/query';
import {
	type IntegrationProviderKey,
	type IntegrationStatusView,
	PROVIDER_META
} from './lib/integrations';

/**
 * Settings query/mutation hooks. Each must be called during component init (uses the query + api-client
 * context). The `create*` argument is wrapped in a function so TanStack Query stays reactive. Query keys,
 * stale policy, invalidation, and toast copy match the shared cache contract.
 */

type ProductKey =
	| 'starterMonthly'
	| 'starterYearly'
	| 'plusMonthly'
	| 'plusYearly'
	| 'ultraMonthly'
	| 'ultraYearly';
export type PendingKey = ProductKey | 'portal' | 'cancel';
export type { ProductKey };

/** Snapshot billing berjalan (plan + saldo kredit + status langganan). */
export function useBillingCurrent(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.billing.current(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.billing.current.get())
	}));
}

/** Katalog plan publik + produk Mayar. */
export function useBillingPlans(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.billing.plans(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.billing.plans.get()),
		staleTime: 5 * 60_000
	}));
}

/** Timeseries usage harian (30/90/365). `days` is read reactively via the getter. */
export function useUsageActivity(days: () => number, enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.billing.usage(days()),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.billing.usage.activity.get({ query: { days: days() } }))
	}));
}

/** Profil user (display name). */
export function useProfile(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.user.me(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.users.me.get())
	}));
}

/** Mulai checkout Mayar → redirect ke payment link membership. */
export function useCheckout() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (productKey: ProductKey) => {
			const origin = window.location.origin;
			return unwrap(
				await api.billing.checkout.post({
					productKey,
					origin,
					successUrl: `${origin}/app/settings/usage-billing`
				})
			);
		},
		onSuccess: (res) => {
			if (res?.url) window.location.href = res.url;
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memulai checkout.'))
	}));
}

/** Kelola tagihan: Mayar mengirim magic-link portal ke email (bukan redirect). */
export function usePortal() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () => unwrap(await api.billing.portal.post()),
		onSuccess: () => {
			toast.success('Tautan kelola tagihan dikirim ke email kamu.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengirim tautan portal.'))
	}));
}

/** Ganti paket (upgrade/downgrade) → redirect ke checkout tier baru (Mayar). */
export function useChangeSubscription() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (productKey: ProductKey) =>
			unwrap(await api.billing.subscription.change.post({ productKey })),
		onSuccess: (res) => {
			if (res?.url) window.location.href = res.url;
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengganti paket.'))
	}));
}

/** Batalkan langganan: Mayar tak punya API cancel → kirim magic-link portal. */
export function useCancelSubscription() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () => unwrap(await api.billing.subscription.cancel.post()),
		onSuccess: () => {
			toast.success('Cek email untuk kelola/batalkan langganan di portal Mayar.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengirim tautan portal.'))
	}));
}

/** Perbarui display name. */
export function useUpdateDisplayName() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (name: string) => unwrap(await api.users.me.patch({ name })),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.user.me() });
			toast.success('Nama tampilan diperbarui.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui nama.'))
	}));
}

/** Preferensi Astra + minat riset (Settings → Personalisasi, IMP-2). */
export function usePreferences(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.preferences.detail(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.preferences.get())
	}));
}

/** Patch preferensi Astra — hanya field yang dikirim yang berubah; null = reset ke default. */
export function useUpdatePreferences() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (patch: {
			answerLanguage?: string | null;
			citationStyle?: string | null;
			responseStyle?: string | null;
			customInstruction?: string | null;
		}) => unwrap(await api.preferences.patch(patch)),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.preferences.all });
			toast.success('Preferensi Astra disimpan.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menyimpan preferensi.'))
	}));
}

/** Patch minat riset (interests onboarding) — minimal 3 bidang; feed ikut menyesuaikan. */
export function useUpdateInterests() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (interests: string[]) =>
			unwrap(await api.preferences.interests.patch({ interests })),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.preferences.all });
			qc.invalidateQueries({ queryKey: queryKeys.feed.all });
			toast.success('Minat riset diperbarui.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memperbarui minat riset.'))
	}));
}

/** Daftar perangkat/sesi aktif (diproksi ke Clerk Backend lewat api). */
export function useSessions(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.security.sessions(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.security.sessions.get())
	}));
}

/** Keluarkan satu perangkat (revoke sesi). Sesi sendiri ditolak server. */
export function useRevokeSession() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (id: string) => unwrap(await api.security.sessions({ id }).revoke.post()),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.security.sessions() });
			toast.success('Perangkat dikeluarkan.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal mengeluarkan perangkat.'))
	}));
}

/** Status koneksi semua provider referensi (Settings → Integrasi). */
export function useIntegrations(enabled: () => boolean) {
	const api = getApiClient();
	return createQuery(() => ({
		queryKey: queryKeys.integrations.list(),
		enabled: enabled(),
		queryFn: async () => unwrap(await api.integrations.get()) as IntegrationStatusView[]
	}));
}

/** Mulai OAuth connect → redirect ke halaman consent provider. */
export function useConnectIntegration() {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async (provider: IntegrationProviderKey) =>
			unwrap(await api.integrations({ provider }).connect.get()) as { url: string },
		onSuccess: (res) => {
			if (res?.url) window.location.href = res.url;
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memulai koneksi.'))
	}));
}

/** Connect via API key (Zotero) — simpan key + user id, validasi backend. */
export function useConnectApiKeyIntegration() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (input: {
			provider: IntegrationProviderKey;
			apiKey: string;
			userId?: string;
		}) =>
			unwrap(
				await api.integrations({ provider: input.provider }).key.post({
					apiKey: input.apiKey,
					userId: input.userId
				})
			) as IntegrationStatusView,
		onSuccess: (_res, input) => {
			qc.invalidateQueries({ queryKey: queryKeys.integrations.all });
			const label = PROVIDER_META[input.provider].label;
			toast.success(`${label} terhubung.`);
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menghubungkan akun.'))
	}));
}

/** Putuskan koneksi provider — data citation Aqsha tidak ikut terhapus. */
export function useDisconnectIntegration() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (provider: IntegrationProviderKey) =>
			unwrap(await api.integrations({ provider }).delete()) as { ok: true },
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.integrations.all });
			toast.success('Koneksi diputuskan.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal memutuskan koneksi.'))
	}));
}

/** "Sinkronkan sekarang" — refresh token + profil koneksi. */
export function useRefreshIntegration() {
	const api = getApiClient();
	const qc = useQueryClient();
	return createMutation(() => ({
		mutationFn: async (provider: IntegrationProviderKey) =>
			unwrap(await api.integrations({ provider }).refresh.post()) as IntegrationStatusView,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.integrations.all });
			toast.success('Koneksi disinkronkan.');
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menyinkronkan koneksi.'))
	}));
}

/** Hapus akun → tombstone+enqueue cascade di server, lalu sign-out Clerk → "/". */
export function useDeleteAccount(signOut: (opts: { redirectUrl: string }) => Promise<unknown>) {
	const api = getApiClient();
	return createMutation(() => ({
		mutationFn: async () => unwrap(await api.users.me.delete()),
		onSuccess: async () => {
			await signOut({ redirectUrl: '/' });
		},
		onError: (e) => toast.error(readableApiErrorMessage(e, 'Gagal menghapus akun.'))
	}));
}
