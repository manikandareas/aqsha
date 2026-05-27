"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useSettingsSecurityData } from "./use-settings-security-data";
import {
  changeAccountPassword,
  deleteCurrentAccount,
  linkOAuthProvider,
  listSecurityState,
  readableAuthError,
  requestAccountPasswordReset,
  revokeAccountSession,
  revokeOtherAccountSessions,
  type AuthAccount,
  type AuthSession,
  type OAuthProvider,
} from "../lib/security-auth-client";

export type SecurityPendingKey =
  | "change-password"
  | "reset-password"
  | "sessions-other"
  | "delete-account"
  | `oauth-${OAuthProvider}`
  | `session-${string}`
  | null;

export function useSecuritySettingsController() {
  const router = useRouter();
  const { viewer, capabilities } = useSettingsSecurityData();
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(true);
  const [pendingKey, setPendingKey] = useState<SecurityPendingKey>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const credentialAccount = useMemo(
    () => accounts.find((account) => account.providerId === "credential"),
    [accounts],
  );
  const viewerEmail = viewer?.email ?? null;

  const loadSecurityState = useCallback(async () => {
    setLoadingSecurity(true);
    setError(null);
    try {
      const state = await listSecurityState();
      setAccounts(state.accounts);
      setSessions(state.sessions);
    } catch (loadError) {
      setError(readableAuthError(loadError, "Gagal memuat konfigurasi keamanan."));
    } finally {
      setLoadingSecurity(false);
    }
  }, []);

  useEffect(() => {
    if (!viewer || !capabilities) return;
    let cancelled = false;

    listSecurityState()
      .then((state) => {
        if (cancelled) return;
        setAccounts(state.accounts);
        setSessions(state.sessions);
        setLoadingSecurity(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(readableAuthError(loadError, "Gagal memuat konfigurasi keamanan."));
        setLoadingSecurity(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewer, capabilities]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }, [router]);

  const changePassword = useCallback(async () => {
    setPendingKey("change-password");
    setError(null);
    setNotice(null);
    try {
      await changeAccountPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setNotice("Kata sandi diperbarui dan sesi lain dicabut.");
      await loadSecurityState();
    } catch (changeError) {
      setError(readableAuthError(changeError, "Gagal mengubah kata sandi."));
    } finally {
      setPendingKey(null);
    }
  }, [currentPassword, newPassword, loadSecurityState]);

  const sendPasswordReset = useCallback(async () => {
    if (!viewerEmail) return;
    setPendingKey("reset-password");
    setError(null);
    setNotice(null);
    try {
      await requestAccountPasswordReset({
        email: viewerEmail,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setNotice("Link reset kata sandi sudah dikirim ke email akun.");
    } catch (resetError) {
      setError(readableAuthError(resetError, "Gagal mengirim reset kata sandi."));
    } finally {
      setPendingKey(null);
    }
  }, [viewerEmail]);

  const linkProvider = useCallback(
    async (provider: OAuthProvider) => {
      setPendingKey(`oauth-${provider}`);
      setError(null);
      setNotice(null);
      try {
        const origin = window.location.origin;
        const data = await linkOAuthProvider({
          provider,
          callbackURL: `${origin}/settings/security`,
          errorCallbackURL: `${origin}/settings/security`,
        });
        if (data.url) {
          window.location.assign(data.url);
        } else {
          await loadSecurityState();
        }
      } catch (linkError) {
        setError(readableAuthError(linkError, "Gagal menghubungkan provider."));
        setPendingKey(null);
      }
    },
    [loadSecurityState],
  );

  const revokeSession = useCallback(
    async (token: string) => {
      setPendingKey(`session-${token}`);
      setError(null);
      setNotice(null);
      try {
        await revokeAccountSession(token);
        setNotice("Sesi dicabut.");
        await loadSecurityState();
      } catch (revokeError) {
        setError(readableAuthError(revokeError, "Gagal mencabut sesi."));
      } finally {
        setPendingKey(null);
      }
    },
    [loadSecurityState],
  );

  const revokeOtherSessions = useCallback(async () => {
    setPendingKey("sessions-other");
    setError(null);
    setNotice(null);
    try {
      await revokeOtherAccountSessions();
      setNotice("Semua sesi lain dicabut.");
      await loadSecurityState();
    } catch (revokeError) {
      setError(readableAuthError(revokeError, "Gagal mencabut sesi lain."));
    } finally {
      setPendingKey(null);
    }
  }, [loadSecurityState]);

  const deleteAccount = useCallback(async () => {
    setPendingKey("delete-account");
    setError(null);
    setNotice(null);
    try {
      const data = await deleteCurrentAccount({
        password: deletePassword.trim() || undefined,
        callbackURL: `${window.location.origin}/sign-in`,
      });
      setDeletePassword("");
      setDeleteConfirmation("");
      setNotice(
        data.message === "Verification email sent"
          ? "Cek email kamu untuk mengonfirmasi hapus akun permanen."
          : "Akun sudah dihapus.",
      );
    } catch (deleteError) {
      setError(readableAuthError(deleteError, "Gagal memulai hapus akun."));
    } finally {
      setPendingKey(null);
    }
  }, [deletePassword]);

  return {
    viewer,
    capabilities,
    accounts,
    sessions,
    credentialAccount,
    viewerEmail,
    loadingSecurity,
    pendingKey,
    notice,
    error,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    deletePassword,
    setDeletePassword,
    deleteConfirmation,
    setDeleteConfirmation,
    signOut,
    changePassword,
    sendPasswordReset,
    linkProvider,
    revokeSession,
    revokeOtherSessions,
    deleteAccount,
  };
}

export type SecuritySettingsController = ReturnType<typeof useSecuritySettingsController>;
