"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSettingsSecurityData } from "./use-settings-security-data";
import {
  changeSecurityPassword,
  deleteSecurityUser,
  linkSecurityProvider,
  listSecurityAuthState,
  requestSecurityPasswordReset,
  revokeOtherSecuritySessions,
  revokeSecuritySession,
  signOutSecurityUser,
  unlinkSecurityProvider,
  type SecurityAccount,
  type SecurityProviderId,
  type SecuritySession,
} from "./security-auth-client";

export type SecurityPendingKey =
  | `link:${SecurityProviderId}`
  | `unlink:${SecurityProviderId}`
  | `session:${string}`
  | "sessions:other"
  | "password:reset"
  | "password:change"
  | "account:delete"
  | null;

export function useSettingsSecurityController() {
  const router = useRouter();
  const { viewer, authConfig } = useSettingsSecurityData();
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [accounts, setAccounts] = useState<SecurityAccount[]>([]);
  const [pendingKey, setPendingKey] = useState<SecurityPendingKey>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [deleteForm, setDeleteForm] = useState({
    password: "",
    confirmation: "",
  });

  const refreshAuthState = useCallback(async () => {
    const nextState = await listSecurityAuthState();
    setSessions(nextState.sessions);
    setAccounts(nextState.accounts);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAuthState().catch((refreshError) => {
        setError(readableAuthError(refreshError));
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshAuthState]);

  const linkedProviders = useMemo(
    () => new Set(accounts.map((account) => account.providerId)),
    [accounts],
  );
  const viewerEmail = viewer?.email ?? null;

  const runAction = useCallback(
    async (key: Exclude<SecurityPendingKey, null>, action: () => Promise<string | null>) => {
      setPendingKey(key);
      setNotice(null);
      setError(null);
      try {
        const message = await action();
        if (message) setNotice(message);
        await refreshAuthState();
      } catch (actionError) {
        setError(readableAuthError(actionError));
      } finally {
        setPendingKey(null);
      }
    },
    [refreshAuthState],
  );

  const linkProvider = useCallback(
    (provider: SecurityProviderId) =>
      runAction(`link:${provider}`, async () => {
        await linkSecurityProvider({
          provider,
          callbackURL: window.location.href,
        });
        return "OAuth redirect dibuka untuk menghubungkan akun.";
      }),
    [runAction],
  );

  const unlinkProvider = useCallback(
    (provider: SecurityProviderId, account: SecurityAccount) =>
      runAction(`unlink:${provider}`, async () => {
        await unlinkSecurityProvider(account);
        return "Akun OAuth berhasil diputus.";
      }),
    [runAction],
  );

  const revokeSession = useCallback(
    (session: SecuritySession) =>
      runAction(`session:${session.token}`, async () => {
        await revokeSecuritySession(session.token);
        return "Sesi berhasil dicabut.";
      }),
    [runAction],
  );

  const revokeOtherSessions = useCallback(
    () =>
      runAction("sessions:other", async () => {
        await revokeOtherSecuritySessions();
        return "Semua sesi lain berhasil dicabut.";
      }),
    [runAction],
  );

  const sendResetPassword = useCallback(
    () =>
      runAction("password:reset", async () => {
        if (!viewerEmail) throw new Error("Email akun belum tersedia.");
        await requestSecurityPasswordReset({
          email: viewerEmail,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        return "Email reset kata sandi sudah dikirim jika alamat ini terdaftar.";
      }),
    [runAction, viewerEmail],
  );

  const changePassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await runAction("password:change", async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          throw new Error("Konfirmasi kata sandi baru tidak sama.");
        }
        await changeSecurityPassword({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        });
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        return "Kata sandi diperbarui dan sesi lain dicabut.";
      });
    },
    [passwordForm, runAction],
  );

  const deleteAccount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await runAction("account:delete", async () => {
        if (deleteForm.confirmation !== "HAPUS") {
          throw new Error("Ketik HAPUS untuk melanjutkan.");
        }
        await deleteSecurityUser({
          password: deleteForm.password || undefined,
          callbackURL: `${window.location.origin}/sign-in?deleted=1`,
        });
        setDeleteForm({ password: "", confirmation: "" });
        return "Email konfirmasi penghapusan akun sudah dikirim.";
      });
    },
    [deleteForm, runAction],
  );

  const signOut = useCallback(async () => {
    await signOutSecurityUser();
    router.replace("/sign-in");
    router.refresh();
  }, [router]);

  return {
    viewer,
    authConfig,
    sessions,
    accounts,
    linkedProviders,
    pendingKey,
    notice,
    error,
    passwordForm,
    setPasswordForm,
    deleteForm,
    setDeleteForm,
    linkProvider,
    unlinkProvider,
    revokeSession,
    revokeOtherSessions,
    sendResetPassword,
    changePassword,
    deleteAccount,
    signOut,
  };
}

function readableAuthError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Aksi keamanan gagal.";
}
