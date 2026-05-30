"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { api } from "@aqsha/convex/api";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionState } from "@/lib/convex-query";

export function useAccountDeletion() {
  const deleteCurrentAccount = useConvexActionState(api.auth.deleteCurrentAccount);
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await deleteCurrentAccount.mutateAsync({});
      setNotice("Akun dan data Aqsha sudah dihapus.");
      await signOut({ redirectUrl: "/sign-in" }).catch(() => {
        window.location.assign("/sign-in");
      });
      setPending(false);
    } catch (deleteError) {
      setError(readableConvexErrorMessage(deleteError, "Gagal menghapus akun."));
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
