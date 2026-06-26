"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useEveAgent } from "eve/react";
import { useCallback, useRef } from "react";
import { useApi } from "@/lib/api-client";
import { queryKeys, unwrap } from "@/lib/api-query";
import type { ChatThread } from "../types";

/** Retry singkat menunggu hook `session.started` membuat thread (race klien↔hook). */
const DISCOVER_ATTEMPTS = 16;
const DISCOVER_DELAY_MS = 250;
/** Toleransi skew jam klien↔server saat menyaring thread `streaming` basi. */
const DISCOVER_SINCE_BUFFER_MS = 120_000;

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
export function useAstraAgent(initialSession?: {
  sessionId: string;
  streamIndex: number;
  continuationToken?: string | null;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const api = useApi();
  const boundRef = useRef(initialSession != null);
  const sessionIdRef = useRef<string | null>(initialSession?.sessionId ?? null);
  const discoveringRef = useRef(false);

  const bearer = useCallback(async () => (await getToken()) ?? "", [getToken]);

  /**
   * Turn PERTAMA: `useEveAgent` baru surface sessionId di akhir turn (`onSessionChange` di
   * `finally` send()), dan `session.started` TAK membawa sessionId → URL tetap `/app/threads`
   * selama agent menyusun plan. Refresh di jendela itu mendarat di halaman kosong. Solusi:
   * begitu event PERTAMA tiba (stream jalan), temukan sessionId via thread `streaming` termuda
   * milik caller (`GET /threads/recent-active`, retry singkat untuk race hook `session.started`)
   * lalu bump URL SEGERA. `since` menyaring thread streaming basi. No-op untuk continue-thread
   * (`initialSession` ada → boundRef sudah true). onSessionChange tetap mengoreksi ke id eve
   * otoritatif bila berbeda.
   */
  const discoverFirstTurnSession = useCallback(async () => {
    if (discoveringRef.current || boundRef.current) return;
    discoveringRef.current = true;
    const since = Date.now() - DISCOVER_SINCE_BUFFER_MS;
    for (let attempt = 0; attempt < DISCOVER_ATTEMPTS && !boundRef.current; attempt += 1) {
      const thread = await api.threads["recent-active"]
        .get({ query: { since } })
        .then((r) => unwrap(r) as ChatThread | null)
        .catch(() => null);
      if (thread?.id) {
        sessionIdRef.current = thread.id;
        if (!boundRef.current && typeof window !== "undefined") {
          boundRef.current = true;
          window.history.replaceState(window.history.state, "", `/app/threads/${thread.id}`);
          qc.invalidateQueries({ queryKey: queryKeys.threads.all });
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, DISCOVER_DELAY_MS));
    }
  }, [api, qc]);

  // eve SessionState: continuationToken `string | undefined` (bukan null). Tanpa token,
  // continue route ditolak ("Missing or empty continuationToken") → wajib teruskan saat ada.
  const eveInitialSession = initialSession
    ? {
        sessionId: initialSession.sessionId,
        streamIndex: initialSession.streamIndex,
        ...(initialSession.continuationToken
          ? { continuationToken: initialSession.continuationToken }
          : {}),
      }
    : undefined;

  const agent = useEveAgent({
    auth: { bearer },
    // Resiliensi reconnect (default eve = 3). Akar masalah streaming sudah ditangani proxy
    // Route Handler (`app/eve/v1/[...path]/route.ts`); ini cadangan untuk putus sungguhan:
    // saat /deep menjalankan subagent, turn induk bisa diam bermenit-menit tanpa event, dan
    // eve tak mengirim keepalive — bila socket tertutup (dev server restart, blip), klien
    // reconnect dari cursor & melanjutkan. Boundary (session.waiting/completed/failed)
    // menghentikan loop seketika saat turn selesai, jadi nilai tinggi tak menimbulkan churn.
    maxReconnectAttempts: 120,
    ...(eveInitialSession ? { initialSession: eveInitialSession } : {}),
    // Event PERTAMA tiba (stream jalan) → temukan sessionId turn-pertama lebih awal & bump URL,
    // supaya refresh saat agent menyusun plan tak mendarat di halaman kosong (lihat
    // `discoverFirstTurnSession`). No-op begitu terikat (continue-thread / sudah ketemu).
    onEvent() {
      if (!boundRef.current) void discoverFirstTurnSession();
    },
    onSessionChange(session) {
      if (!session.sessionId) return;
      // Koreksi ke id eve OTORITATIF: discovery turn-pertama bisa keliru di kasus langka
      // (thread streaming lain di jendela `since`) → samakan URL ke id sebenarnya di akhir turn.
      const changed = sessionIdRef.current !== session.sessionId;
      sessionIdRef.current = session.sessionId;
      if (typeof window !== "undefined" && (!boundRef.current || changed)) {
        boundRef.current = true;
        window.history.replaceState(window.history.state, "", `/app/threads/${session.sessionId}`);
      }
      // Persist handle-resume eve KLIEN (ter-namespace SEKALI) → approval HITL `inputResponses`
      // + follow-up lintas-reload bisa di-`deliver`. eve menamespace lagi saat dikirim balik;
      // token server (`channel.continuationToken`) ganda → `deliver` gagal (lihat ThreadService
      // .saveContinuation). Best-effort; turn settle berikutnya menulis ulang token terbaru.
      if (session.sessionId && session.continuationToken) {
        void api
          .threads({ id: session.sessionId })
          .session.post({ continuationToken: session.continuationToken })
          .catch(() => {});
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
