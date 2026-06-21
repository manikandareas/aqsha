"use client";

import { useEffect, useRef } from "react";
import { useSendStatus } from "../api";
import { evePartsToTimeline } from "../lib/eve-timeline";
import { useAstraAgent } from "../lib/use-astra-agent";
import { MessageList } from "./message-list";
import { SourcesPanel } from "./sources-panel";
import { type ComposerNotice, Composer } from "./composer";

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
 * Surface chat BARU (Slice 6.1) — LIVE-only via `useAstraAgent` (stream eve). Saat turn
 * pertama, URL bump ke `/app/threads/<id>` (komponen tetap mounted). History persist
 * lewat hook proyeksi eve; reload thread → view history (`ThreadView`).
 */
export function NewChat() {
  const { agent } = useAstraAgent();
  const sendStatus = useSendStatus();
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const notice = blockedNotice(sendStatus.data);
  const blocked = notice !== null;

  // Timeline penuh (text + reasoning + tool parts terurut) dari stream eve — adapter
  // pure. Sebelum 6.3 ini di-flatten ke teks saja; kini per-part (live-only, D-F).
  const messages = evePartsToTimeline(agent.data.messages);
  const partCount = messages.reduce((n, m) => n + m.parts.length, 0);
  // Session id di-mint eve saat turn pertama selesai; panel Sources fetch sumber
  // yang dipersist tool riset (kosong → tersembunyi). Pause fetch saat streaming.
  const sessionId = agent.session?.sessionId ?? null;

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
          // eve `agent.error` = `Error`/`ClientError` biasa (bukan error Eden ber-`.value`),
          // jadi tampilkan `.message` langsung — `readableApiErrorMessage` akan selalu fallback.
          <p className="mt-4 text-red-500 text-sm">{agent.error.message || "Terjadi kesalahan."}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 pt-0">
        <Composer
          onSend={(payload) =>
            void agent.send({
              message: payload.text,
              ...(payload.clientContext ? { clientContext: payload.clientContext } : {}),
            })
          }
          onStop={() => agent.stop()}
          busy={busy}
          disabled={blocked}
          notice={notice}
        />
      </div>
    </div>
  );
}
