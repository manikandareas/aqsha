"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import { api } from "@aqsha/convex/api";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexActionState } from "@/lib/convex-query";

export function useAccountDeletion() {
  const deleteCurrentAccount = useConvexActionState(api.auth.deleteCurrentAccount);
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  const deleteAccount = async () => {
    setPending(true);
    try {
      await deleteCurrentAccount.mutateAsync({});
      toast.success("Akun dan data Aqsha sudah dihapus.");
      await signOut({ redirectUrl: "/sign-in" }).catch(() => {
        window.location.assign("/sign-in");
      });
      setPending(false);
    } catch (deleteError) {
      toast.error(readableConvexErrorMessage(deleteError, "Akun belum bisa dihapus. Coba lagi sebentar."));
      setPending(false);
    }
  };

  return {
    deleteAccount,
    pending,
  };
}
