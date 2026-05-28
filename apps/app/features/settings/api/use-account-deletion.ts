"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useAccountDeletion() {
  const deleteCurrentAccount = useAction(api.auth.deleteCurrentAccount);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await deleteCurrentAccount({});
      setNotice("Akun dan data Aqsha sudah dihapus.");
      window.location.assign("/sign-in");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus akun.");
    } finally {
      setPending(false);
    }
  };

  return {
    deleteAccount,
    error,
    notice,
    pending,
  };
}
