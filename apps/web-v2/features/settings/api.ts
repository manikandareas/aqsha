"use client";

import { useClerk } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import { queryKeys, unwrap } from "@/lib/api-query";

type ProductKey =
  | "starterMonthly"
  | "starterYearly"
  | "plusMonthly"
  | "plusYearly"
  | "ultraMonthly"
  | "ultraYearly";
export type PendingKey = ProductKey | "portal" | "cancel";
export type { ProductKey };

/** Snapshot billing berjalan (plan + saldo kredit + status langganan). */
export function useBillingCurrent() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.billing.current(),
    queryFn: async () => unwrap(await api.billing.current.get()),
  });
}

/** Katalog plan publik + produk Mayar. */
export function useBillingPlans() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.billing.plans(),
    queryFn: async () => unwrap(await api.billing.plans.get()),
    staleTime: 5 * 60_000,
  });
}

/** Timeseries usage harian (30/90/365). */
export function useUsageActivity(days: number) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.billing.usage(days),
    queryFn: async () => unwrap(await api.billing.usage.activity.get({ query: { days } })),
  });
}

/** Profil user (display name). */
export function useProfile() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.user.me(),
    queryFn: async () => unwrap(await api.users.me.get()),
  });
}

/** Mulai checkout Mayar → redirect ke payment link membership. */
export function useCheckout() {
  const api = useApi();
  return useMutation({
    mutationFn: async (productKey: ProductKey) => {
      const origin = window.location.origin;
      return unwrap(
        await api.billing.checkout.post({
          productKey,
          origin,
          successUrl: `${origin}/app/settings/usage-billing`,
        }),
      );
    },
    onSuccess: (res) => {
      if (res?.url) window.location.href = res.url;
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal memulai checkout.")),
  });
}

/** Kelola tagihan: Mayar mengirim magic-link portal ke email (bukan redirect). */
export function usePortal() {
  const api = useApi();
  return useMutation({
    mutationFn: async () => unwrap(await api.billing.portal.post()),
    onSuccess: () => {
      toast.success("Tautan kelola tagihan dikirim ke email kamu.");
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengirim tautan portal.")),
  });
}

/** Ganti paket (upgrade/downgrade) → redirect ke checkout tier baru (Mayar). */
export function useChangeSubscription() {
  const api = useApi();
  return useMutation({
    mutationFn: async (productKey: ProductKey) =>
      unwrap(await api.billing.subscription.change.post({ productKey })),
    onSuccess: (res) => {
      if (res?.url) window.location.href = res.url;
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengganti paket.")),
  });
}

/** Batalkan langganan: Mayar tak punya API cancel → kirim magic-link portal. */
export function useCancelSubscription() {
  const api = useApi();
  return useMutation({
    mutationFn: async () => unwrap(await api.billing.subscription.cancel.post()),
    onSuccess: () => {
      toast.success("Cek email untuk kelola/batalkan langganan di portal Mayar.");
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengirim tautan portal.")),
  });
}

/** Perbarui display name. */
export function useUpdateDisplayName() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => unwrap(await api.users.me.patch({ name })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.user.me() });
      toast.success("Nama tampilan diperbarui.");
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal memperbarui nama.")),
  });
}

/** Daftar perangkat/sesi aktif (diproksi ke Clerk Backend lewat api-v2). */
export function useSessions() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.security.sessions(),
    queryFn: async () => unwrap(await api.security.sessions.get()),
  });
}

/** Keluarkan satu perangkat (revoke sesi). Sesi sendiri ditolak server. */
export function useRevokeSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.security.sessions({ id }).revoke.post()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.security.sessions() });
      toast.success("Perangkat dikeluarkan.");
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal mengeluarkan perangkat.")),
  });
}

/** Hapus akun → tombstone+enqueue cascade di server, lalu sign-out Clerk → "/". */
export function useDeleteAccount() {
  const api = useApi();
  const { signOut } = useClerk();
  return useMutation({
    mutationFn: async () => unwrap(await api.users.me.delete()),
    onSuccess: async () => {
      await signOut({ redirectUrl: "/" });
    },
    onError: (e) => toast.error(readableApiErrorMessage(e, "Gagal menghapus akun.")),
  });
}
