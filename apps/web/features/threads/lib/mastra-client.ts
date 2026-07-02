"use client";

import type { AgentKind } from "@aqsha/chat-core";
import { useAuth } from "@clerk/nextjs";
import { MastraClient } from "@mastra/client-js";
import { useMemo } from "react";

/** Tier agen Astra — kontrak tunggal di `@aqsha/chat-core`, di-re-export untuk pemakai lib threads. */
export type { AgentKind };

/** Id agent Mastra (key di `new Mastra({ agents })`) — lihat `apps/agent/src/mastra/index.ts`. */
export const ASTRA_AGENT_ID = "astra-lite";
const ASTRA_PRO_AGENT_ID = "astra-pro";

/**
 * Agent ID per tier. Route Mastra `sendMessage`/`subscribeToThread` AGENT-SCOPED
 * (`/agents/:id/...`) → turn Pro mengalir di channel `astra-pro`, jadi langganan thread WAJIB
 * menunjuk agent yang sama dengan turn aktif (lihat `committedAgentKind` di `use-mastra-agent.ts`).
 */
export function agentIdFor(agentKind: AgentKind): string {
  return agentKind === "pro" ? ASTRA_PRO_AGENT_ID : ASTRA_AGENT_ID;
}

/**
 * Klien `@mastra/client-js` same-origin → proxy `/mastra-api/*` (lihat
 * `app/mastra-api/[...path]/route.ts`) → server Mastra `@aqsha/agent`. Bearer Clerk di-inject
 * SEGAR per-request lewat `fetch` kustom (`getToken()`), bukan header statis (token pendek-umur);
 * `server.auth` Mastra (MastraAuthClerk) yang memverifikasi.
 *
 * Stop turn TIDAK lagi lewat AbortController di sini — durable-thread memakai `abortThread`
 * (cancel server-side); langganan/run terlepas dari koneksi fetch (lihat `use-mastra-agent.ts`).
 */
export function useMastraClient(): MastraClient {
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
          return fetch(input as RequestInfo, { ...init, headers });
        },
      }),
    [getToken],
  );
}
