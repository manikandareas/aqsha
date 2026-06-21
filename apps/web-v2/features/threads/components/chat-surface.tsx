"use client";

import { useEffect, useRef, useState } from "react";
import { useSendStatus } from "../api";
import { evePartsToTimeline, type TimelineMessage } from "../lib/eve-timeline";
import { useAstraAgent } from "../lib/use-astra-agent";
import { type ComposerNotice, Composer } from "./composer";
import { MessageList } from "./message-list";
import { SourcesPanel } from "./sources-panel";

/** Map status kirim terblok → notice composer (pesan ramah + retryAt untuk countdown). */
function blockedNotice(status: ReturnType<typeof useSendStatus>["data"]): ComposerNotice | null {
  if (!status || status.canSend) return null;
  switch (status.reason) {
    case "cooldown":
      return { message: "Terlalu cepat. Tunggu sebentar sebelum mengirim lagi.", retryAt: status.retryAt };
    case "quota_exceeded":
      return { message: "Kredit chat bulan ini sudah habis. Tingkatkan paket atau tunggu reset." };
    case "subscription_required":
      return { message: "Fitur ini butuh paket berbayar. Tingkatkan paket untuk melanjutkan." };
    case "billing_inactive":
      return { message: "Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan." };
    default:
      return { message: "Pengiriman sedang tidak tersedia." };
  }
}

/**
 * Surface chat live (Slice 6.1/6.8) — dipakai chat BARU (`NewChat`) maupun lanjut thread
 * lama (`ThreadView`). Stream turn berjalan via `useAstraAgent` (eve). `history` = snapshot
 * transkrip persisted (hanya dipakai thread lama; di-freeze pemanggil) → di-render SEBELUM
 * buffer live. Karena `initialSession` TIDAK backfill buffer (hanya new turn), `[...history,
 * ...live]` tak duplikat. Retry: saat `agent.error`, draft terakhir di-restore ke composer.
 */
export function ChatSurface({
  initialSession,
  history,
}: {
  initialSession?: { sessionId: string; streamIndex: number };
  history?: TimelineMessage[];
}) {
  const { agent } = useAstraAgent(initialSession);
  const sendStatus = useSendStatus();
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;

  const live = evePartsToTimeline(agent.data.messages);
  const messages = history && history.length > 0 ? [...history, ...live] : live;
  const partCount = messages.reduce((n, m) => n + m.parts.length, 0);
  const sessionId = agent.session?.sessionId ?? initialSession?.sessionId ?? null;

  // Retry (Slice 6.8): simpan teks turn terakhir; saat error, kembalikan ke composer
  // (resend = turn baru; turn gagal tanpa step.completed = tak ada debit → no re-charge).
  const [lastSent, setLastSent] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll saat transkrip/parts berubah
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, partCount, agent.status]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList
          messages={messages}
          pending={busy}
          busy={busy}
          onRespond={(r) => void agent.send({ inputResponses: [r] })}
        />
        {sessionId ? <SourcesPanel threadId={sessionId} enabled={!busy} /> : null}
        {agent.error ? (
          <p className="mt-4 text-red-500 text-sm">{agent.error.message || "Terjadi kesalahan."}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 pt-0">
        <Composer
          onSend={(payload) => {
            setLastSent(payload.text);
            void agent.send({
              message: payload.text,
              ...(payload.clientContext ? { clientContext: payload.clientContext } : {}),
            });
          }}
          onStop={() => agent.stop()}
          busy={busy}
          disabled={blocked}
          notice={notice}
          threadId={sessionId}
          errorDraft={agent.error ? lastSent : null}
        />
      </div>
    </div>
  );
}
