"use client";

import { useEffect, useRef } from "react";
import { useAstraAgent } from "../lib/use-astra-agent";
import { type ChatBubble, MessageList } from "./message-list";
import { Composer } from "./composer";

/**
 * Surface chat BARU (Slice 6.1) — LIVE-only via `useAstraAgent` (stream eve). Saat turn
 * pertama, URL bump ke `/app/threads/<id>` (komponen tetap mounted). History persist
 * lewat hook proyeksi eve; reload thread → view history (`ThreadView`).
 */
export function NewChat() {
  const { agent } = useAstraAgent();
  const busy = agent.status === "submitted" || agent.status === "streaming";

  const messages: ChatBubble[] = agent.data.messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(""),
  }));

  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll saat transkrip berubah
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, agent.status]);

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={messages} pending={busy} />
        {agent.error ? (
          // eve `agent.error` = `Error`/`ClientError` biasa (bukan error Eden ber-`.value`),
          // jadi tampilkan `.message` langsung — `readableApiErrorMessage` akan selalu fallback.
          <p className="mt-4 text-red-500 text-sm">{agent.error.message || "Terjadi kesalahan."}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 pt-0">
        <Composer
          onSend={(text) => void agent.send({ message: text })}
          onStop={() => agent.stop()}
          busy={busy}
        />
      </div>
    </div>
  );
}
