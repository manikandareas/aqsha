"use client";

import { useCallback, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useAccountDeletion() {
  const deleteCurrentAccount = useAction(api.auth.deleteCurrentAccount);
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = useCallback(async () => {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await deleteCurrentAccount({});
      setNotice("Akun dan data Aqsha sudah dihapus.");
      await signOut({ redirectUrl: "/sign-in" }).catch(() => {
        window.location.assign("/sign-in");
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus akun.");
    } finally {
      setPending(false);
    }
  }, [deleteCurrentAccount, signOut]);

  return {
    deleteAccount,
    error,
    notice,
    pending,
  };
}
