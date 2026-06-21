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
 * - `onFinish`: invalidate daftar thread (judul/preview/aktivitas terbaru masuk list).
 *
 * ASUMSI: "percakapan baru" = MOUNT BARU `NewChat` (via `<Link href="/app/threads">`),
 * bukan `agent.reset()` in-place. Karena itu `boundRef` cukup sekali-pakai per mount; thread
 * row sudah dibuat hook proyeksi `session.started` jauh sebelum turn selesai.
 *
 * Catatan: surface ini live-only. Membuka thread lama (`/app/threads/[id]`) = view history
 * read-only; resume eve session lintas-reload = slice lanjutan.
 */
export function useAstraAgent() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const boundRef = useRef(false);

  const bearer = useCallback(async () => (await getToken()) ?? "", [getToken]);

  const agent = useEveAgent({
    auth: { bearer },
    onSessionChange(session) {
      if (session.sessionId && !boundRef.current && typeof window !== "undefined") {
        boundRef.current = true;
        window.history.replaceState(window.history.state, "", `/app/threads/${session.sessionId}`);
      }
    },
    onFinish() {
      qc.invalidateQueries({ queryKey: queryKeys.threads.all });
    },
  });

  return { agent };
}
