"use client";

export function useAccountDeletion() {
  return {
    deleteAccount: async () => {
      throw new Error("Penghapusan akun belum tersedia di V2.");
    },
    isPending: false,
  };
}
