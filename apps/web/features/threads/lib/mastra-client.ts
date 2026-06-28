"use client";

import { useAuth } from "@clerk/nextjs";
import { MastraClient } from "@mastra/client-js";
import { useMemo } from "react";

/** Id agent Mastra (key di `new Mastra({ agents })`) — lihat `apps/agent/src/mastra/index.ts`. */
export const ASTRA_AGENT_ID = "astra-lite";

/**
 * Klien `@mastra/client-js` same-origin → proxy `/mastra-api/*` (lihat
 * `app/mastra-api/[...path]/route.ts`) → server Mastra `@aqsha/agent`. Bearer Clerk di-inject
 * SEGAR per-request lewat `fetch` kustom (`getToken()`), bukan header statis (token pendek-umur);
 * `server.auth` Mastra (MastraAuthClerk) yang memverifikasi.
 */
export function useMastraClient(getSignal?: () => AbortSignal | undefined): MastraClient {
  const { getToken } = useAuth();
  return useMemo(
    () =>
      new MastraClient({
        baseUrl: typeof window !== "undefined" ? window.location.origin : "",
        apiPrefix: "/mastra-api",
        fetch: async (input, init) => {
          const token = await getToken();
          const headers = new Headers(init?.headers);
          if (token) headers.set("authorization", `Bearer ${token}`);
          // Gabung signal klien-js dengan signal stop() hook (bila ada) → tombol stop
          // membatalkan stream berjalan.
          const extra = getSignal?.();
          const signals = [init?.signal, extra].filter(Boolean) as AbortSignal[];
          const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
          return fetch(input as RequestInfo, { ...init, headers, signal });
        },
      }),
    [getToken, getSignal],
  );
}
