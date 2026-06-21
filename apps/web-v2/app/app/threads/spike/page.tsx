"use client";

import { useEveAgent } from "eve/react";
import { useState } from "react";

/**
 * SPIKE Slice 6.0 — "hello Astra". Bukti eve streaming jalan E2E lewat proxy
 * `withEve` (browser → origin web-v2 → proses eve). Belum persist, belum auth
 * Clerk, belum billing — itu slice berikutnya. Route: /app/threads/spike.
 */
export default function AstraSpikePage() {
  const agent = useEveAgent();
  const [draft, setDraft] = useState("");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Astra spike</h1>
        <span className="text-muted-foreground text-xs">Status: {agent.status}</span>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {agent.data.messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada pesan. Ketik lalu kirim.</p>
        ) : (
          agent.data.messages.map((message) => {
            const text = message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("");
            return (
              <article key={message.id} className="space-y-1">
                <header className="text-muted-foreground text-xs">{message.role}</header>
                {text ? <p className="whitespace-pre-wrap text-sm">{text}</p> : null}
              </article>
            );
          })
        )}
      </div>

      {agent.error ? <p className="text-sm text-red-500">{agent.error.message}</p> : null}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const message = draft.trim();
          if (message.length === 0) return;
          setDraft("");
          void agent.send({ message });
        }}
      >
        <input
          aria-label="Pesan untuk Astra"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          placeholder="Tulis pesan untuk Astra…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={isBusy}
        />
        <button
          type="submit"
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={isBusy || draft.trim().length === 0}
        >
          Kirim
        </button>
        {isBusy ? (
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() => agent.stop()}
          >
            Stop
          </button>
        ) : null}
      </form>
    </div>
  );
}
