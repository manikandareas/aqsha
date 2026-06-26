"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useApi } from "@/lib/api-client";

/**
 * Provisioning sekali per userId: POST /users/me/sync (idempotent server-side).
 * Dedupe useRef (StrictMode) + sessionStorage (navigasi dalam tab). Fire-and-forget;
 * error tidak fatal (409 + server-gate menutup race).
 */
export function AuthenticatedUserSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApi();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (syncedFor.current === userId) return;

    const key = `aqsha:synced:${userId}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(key)) {
      syncedFor.current = userId;
      return;
    }

    syncedFor.current = userId;
    void api.users.me.sync.post().then(({ error }) => {
      if (error) {
        syncedFor.current = null; // izinkan retry pada mount berikutnya
      } else if (typeof window !== "undefined") {
        window.sessionStorage.setItem(key, "1");
      }
    });
  }, [isLoaded, isSignedIn, userId, api]);

  return null;
}
