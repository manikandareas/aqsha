"use client";

import { useAuth } from "@clerk/nextjs";
import type { EveAgentReducerEvent } from "eve/react";
import { useEffect, useRef, useState } from "react";

/**
 * Resume turn in-flight lintas-refresh — port bridge eve-chat-template (`agent-chat.tsx`).
 *
 * eve `useEveAgent` TAK punya resume bawaan: store-nya membuka stream HANYA di `send()` (= turn
 * BARU). Saat reload masuk ke turn yang masih berjalan, kita buka ULANG durable stream eve
 * langsung lewat `GET /eve/v1/session/:id/stream?startIndex=N` → server skip event `< N` lalu
 * LANJUT live → token streaming sejati.
 *
 * Hook ini mengembalikan **event MENTAH** (`resumedEvents`), BUKAN pesan ter-reduce. Penggabungan
 * (overlay `[...initialEvents, ...resumedEvents]`) + reduce SEKALI terjadi di surface (`chat-surface`)
 * → satu jalur event log tunggal. `startIndex = max(event_index)+1` → resumedEvents = EKOR turn aktif
 * (disjoint dari prefix persisted).
 *
 * Stream di-fetch MANUAL (bukan `eve/client` `ClientSession.stream`): `eve/client` menyeret runtime
 * (zod/workflow → `node:module`) yang tak bisa di-bundle ke browser — persis seperti template yang
 * juga hand-roll `streamSessionEvents`.
 *
 * **Stop = body-close BERSIH dari server ATAU idle-timeout**, BUKAN tipe event. Kontrak eve
 * `openStreamIterable`: server menutup body saat turn benar-benar usai (incl. saat agent bertanya →
 * turn settle). `/deep` multi-turn auto-lanjut: `session.waiting` transien muncul di batas turn tapi
 * server MENJAGA body terbuka → kita ride sampai close. (Dulu stop di `session.waiting`/`input.requested`
 * → resume putus tiap batas → KEDIP. HITL kini percakapan → tak ada `input.requested`.)
 */
const IDLE_TIMEOUT_MS = 120_000;
const RECONNECT_DELAY_MS = 300;
const MAX_RECONNECTS = 3;
const RETRYABLE_OPEN = new Set([404, 409, 425, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Baca body NDJSON eve → yield tiap event (satu JSON per baris). */
async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      if (value) buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line);
        nl = buffer.indexOf("\n");
      }
    }
    const last = buffer.trim();
    if (last) yield JSON.parse(last);
  } finally {
    reader.releaseLock();
  }
}

export function useThreadResume(params: {
  sessionId: string | null;
  startIndex: number;
  enabled: boolean;
}): { resumedEvents: readonly EveAgentReducerEvent[]; resuming: boolean } {
  const { sessionId, startIndex, enabled } = params;
  const { getToken } = useAuth();
  const [resumedEvents, setResumedEvents] = useState<readonly EveAgentReducerEvent[]>([]);
  const [resuming, setResuming] = useState(false);

  // Refs latest: `getToken`/`startIndex` berubah tiap render (startIndex naik saat cursor
  // merangkak). Disinkronkan SETELAH commit supaya tak menulis ref saat render, tanpa
  // me-restart resume (stream durable dibuka SEKALI per thread; cursor maju monoton `nextIndex`).
  const getTokenRef = useRef(getToken);
  const startIndexRef = useRef(startIndex);
  useEffect(() => {
    getTokenRef.current = getToken;
    startIndexRef.current = startIndex;
  });
  // Sekali-resume per sessionId. Self-managing lintas-thread: sessionId baru ≠ key → buka lagi.
  const startedKeyRef = useRef<string | null>(null);

  // Pindah thread → buang buffer resume thread lama (pola "adjust state during render", bukan
  // effect → tak ada cascading-render warning; konvergen saat trackedSession == sessionId).
  const [trackedSession, setTrackedSession] = useState(sessionId);
  if (sessionId !== trackedSession) {
    setTrackedSession(sessionId);
    setResumedEvents([]);
    setResuming(false);
  }

  useEffect(() => {
    if (!enabled || !sessionId) return;
    if (startedKeyRef.current === sessionId) return;
    startedKeyRef.current = sessionId;

    const abort = new AbortController();
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abort.abort(), IDLE_TIMEOUT_MS);
    };

    setResuming(true);
    const acc: EveAgentReducerEvent[] = [];

    void (async () => {
      let nextIndex = startIndexRef.current;
      let reconnects = MAX_RECONNECTS;
      let stop = false;
      try {
        bumpIdle();
        while (!stop && !cancelled) {
          const token = (await getTokenRef.current()) ?? "";
          const q = nextIndex > 0 ? `?startIndex=${nextIndex}` : "";
          const res = await fetch(
            `/eve/v1/session/${encodeURIComponent(sessionId)}/stream${q}`,
            { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: abort.signal },
          );
          if (!res.ok || !res.body) {
            if (RETRYABLE_OPEN.has(res.status) && reconnects-- > 0) {
              await sleep(RECONNECT_DELAY_MS);
              continue;
            }
            break;
          }
          try {
            for await (const ev of readNdjson(res.body)) {
              if (cancelled) return;
              bumpIdle();
              reconnects = MAX_RECONNECTS; // progress → pulihkan budget reconnect
              nextIndex += 1;
              acc.push(ev as EveAgentReducerEvent);
              setResumedEvents(acc.slice());
            }
            // Body ditutup server tanpa boundary = turn selesai (eve menutup body usai turn).
            stop = true;
          } catch {
            if (cancelled || abort.signal.aborted) return;
            if (reconnects-- <= 0) stop = true; // putus transient → reconnect dari nextIndex
            else await sleep(RECONNECT_DELAY_MS);
          }
        }
      } catch {
        // abort / network → diam (turn selesai atau user pindah thread).
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        if (!cancelled) setResuming(false);
      }
    })();

    return () => {
      cancelled = true;
      if (idleTimer) clearTimeout(idleTimer);
      abort.abort();
    };
  }, [enabled, sessionId]);

  return { resumedEvents, resuming };
}
