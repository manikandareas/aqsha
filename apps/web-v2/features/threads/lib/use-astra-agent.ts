"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { useCallback, useRef } from "react";
import { queryKeys } from "@/lib/api-query";

/**
 * Wrapper `useEveAgent` untuk Astra (Slice 6.1):
 * - Inject bearer Clerk (`auth.bearer`) → channel eve verifikasi via `clerkAuth()`.
 *   Resolver dipanggil per-request (token Clerk berumur pendek).
 * - `onSessionChange`: eve memanggil ini di `finally` `send()` — yakni saat turn pertama
 *   SELESAI (eve mint session id durably saat itu), BUKAN mid-stream. Saat itu kita simpan
 *   id sekali (`boundRef`) + bump URL ke `/app/threads/<id>` lewat `history.replaceState`
 *   (TANPA navigasi Next → komponen tetap mounted, store live tak ke-reset).
 * - `onFinish`: invalidate (1) daftar thread (judul/preview/aktivitas), (2) transkrip thread
 *   ini (`threads.messages(id)`) supaya turn yang baru di-persist hook proyeksi masuk history
 *   TanStack saat surface beralih ke `ThreadView` — SEAM 6.2 (6.1 cuma invalidate `all`),
 *   (3) `send-status` (kredit turun setelah debit `step.completed`).
 *
 * ASUMSI: "percakapan baru" = MOUNT BARU `NewChat` (via `<Link href="/app/threads">`),
 * bukan `agent.reset()` in-place. Karena itu `boundRef` cukup sekali-pakai per mount; thread
 * row sudah dibuat hook proyeksi `session.started` jauh sebelum turn selesai.
 *
 * Continue-thread (Slice 6.8): `initialSession` mengikat hook ke session eve yang sudah
 * ada (`sessionId == threadId`) → `agent.send()` memulai TURN BARU di thread lama (eve
 * session durable). Saat `initialSession` diberikan, URL sudah di `/app/threads/[id]` →
 * `boundRef` mulai `true` supaya tak ada `replaceState`. Resume turn IN-FLIGHT lintas-reload
 * tetap deferred (known gap 6.1) — ini hanya start turn baru.
 */
export function useAstraAgent(initialSession?: { sessionId: string; streamIndex: number }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const boundRef = useRef(initialSession != null);
  const sessionIdRef = useRef<string | null>(initialSession?.sessionId ?? null);

  const bearer = useCallback(async () => (await getToken()) ?? "", [getToken]);

  const agent = useEveAgent({
    auth: { bearer },
    ...(initialSession ? { initialSession } : {}),
    onSessionChange(session) {
      if (session.sessionId) sessionIdRef.current = session.sessionId;
      if (session.sessionId && !boundRef.current && typeof window !== "undefined") {
        boundRef.current = true;
        window.history.replaceState(window.history.state, "", `/app/threads/${session.sessionId}`);
      }
    },
    onFinish() {
      qc.invalidateQueries({ queryKey: queryKeys.threads.all });
      qc.invalidateQueries({ queryKey: queryKeys.threads.sendStatus() });
      const id = sessionIdRef.current;
      if (id) {
        qc.invalidateQueries({ queryKey: queryKeys.threads.messages(id) });
        // Sumber riset yang dipersist tool search (Slice 6.4) → refresh panel Sources.
        qc.invalidateQueries({ queryKey: queryKeys.threads.sources(id) });
      }
    },
  });

  return { agent };
}
