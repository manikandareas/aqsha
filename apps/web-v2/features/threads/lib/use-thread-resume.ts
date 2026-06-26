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
 * **EOF bersih ≠ turn selesai.** eve dev bisa MENUTUP body stream per-snapshot (bukan satu tail
 * panjang yang dijaga terbuka sampai turn usai). Jadi resume meniru jalur SEND eve: setelah EOF
 * tanpa boundary, buka lagi dari `nextIndex`. Bila snapshot tadi berisi event baru, reconnect
 * langsung supaya token jawaban akhir tetap terasa realtime setelah refresh/nav-balik. Bila EOF
 * kosong, pakai backoff pendek supaya thread yang lama diam (mis. subagent /deep) tidak hot-loop.
 * Resume berhenti HANYA saat event terakhir = boundary turn
 * (`session.waiting`/`session.completed`/`session.failed`). Idle-timeout = pengaman turn yang
 * benar-benar mati/hang.
 */
const IDLE_TIMEOUT_MS = 600_000; // 10 mnt: tahan gap subagent /deep yang panjang (tanpa event), tetap stop turn mati
const EOF_AFTER_PROGRESS_DELAY_MS = 0; // token sudah bergerak → reconnect segera agar resume tetap realtime
const EOF_EMPTY_INITIAL_DELAY_MS = 150; // snapshot kosong → tunggu singkat sebelum long-poll ulang
const EOF_EMPTY_MAX_DELAY_MS = 1_000; // cap backoff saat turn aktif tapi parent stream lama diam
const RECONNECT_DELAY_MS = 300;
const MAX_RECONNECTS = 3;
const RETRYABLE_OPEN = new Set([404, 409, 425, 500, 502, 503, 504]);

/** Event terakhir menandai turn benar-benar settle/parkir → resume boleh berhenti. */
const TERMINAL_EVENT_TYPES = new Set(["session.waiting", "session.completed", "session.failed"]);
function lastEventIsTerminal(events: readonly EveAgentReducerEvent[]): boolean {
  const last = events[events.length - 1] as { type?: string } | undefined;
  return last != null && TERMINAL_EVENT_TYPES.has(last.type ?? "");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => done();
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

  // Pindah thread → buang buffer resume thread lama (pola "adjust state during render", bukan
  // effect → tak ada cascading-render warning; konvergen saat trackedSession == sessionId).
  const [trackedSession, setTrackedSession] = useState(sessionId);
  if (sessionId !== trackedSession) {
    setTrackedSession(sessionId);
    setResumedEvents([]);
    setResuming(false);
  }

  // Buka resume HANYA saat aktif. JANGAN pakai ref-guard "sekali per sessionId": React
  // StrictMode (dev) mount→cleanup→mount, jadi guard ref yang bertahan lintas cleanup
  // membuat invocation KEDUA early-return → stream tak pernah benar-benar terbuka (resume
  // mati di dev). Cleanup effect SUDAH meng-abort loop lama sebelum re-run, jadi guard tak
  // diperlukan: deps `[enabled, sessionId]` → re-run hanya saat keduanya berubah, idempoten
  // (dedup by event_index di surface).
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const abort = new AbortController();
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abort.abort(), IDLE_TIMEOUT_MS);
    };

    const acc: EveAgentReducerEvent[] = [];

    // `setResuming(true)` di dalam IIFE (bukan langsung di badan effect) → tak memicu
    // cascading-render sinkron (react-hooks/set-state-in-effect).
    void (async () => {
      setResuming(true);
      let nextIndex = startIndexRef.current;
      let reconnects = MAX_RECONNECTS;
      let emptyEofDelay = EOF_EMPTY_INITIAL_DELAY_MS;
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
              await sleep(RECONNECT_DELAY_MS, abort.signal);
              continue;
            }
            break;
          }
          try {
            let sawEvent = false;
            for await (const ev of readNdjson(res.body)) {
              if (cancelled) return;
              bumpIdle();
              reconnects = MAX_RECONNECTS; // progress → pulihkan budget reconnect
              sawEvent = true;
              emptyEofDelay = EOF_EMPTY_INITIAL_DELAY_MS;
              nextIndex += 1;
              acc.push(ev as EveAgentReducerEvent);
              setResumedEvents(acc.slice());
            }
            // EOF bersih. Berhenti HANYA bila turn sudah settle/parkir; selain itu reconnect dari
            // nextIndex. Setelah snapshot yang berisi event, jangan tidur: delay itulah yang dulu
            // membuat jawaban akhir terasa batch per 1-2 detik setelah refresh/nav-balik.
            if (lastEventIsTerminal(acc)) stop = true;
            else {
              const delay = sawEvent ? EOF_AFTER_PROGRESS_DELAY_MS : emptyEofDelay;
              if (!sawEvent) {
                emptyEofDelay = Math.min(EOF_EMPTY_MAX_DELAY_MS, Math.round(emptyEofDelay * 1.5));
              }
              await sleep(delay, abort.signal);
            }
          } catch {
            if (cancelled || abort.signal.aborted) return;
            if (reconnects-- <= 0) stop = true; // putus transient → reconnect dari nextIndex
            else await sleep(RECONNECT_DELAY_MS, abort.signal);
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
