"use client";

import { SparklesIcon } from "@aqsha/ui/icons";
import { cn } from "@aqsha/ui/lib/cn";

export type ChatBubble = { id: string; role: string; text: string };

/** Daftar pesan minimal (Slice 6.1) — bubble user vs assistant. Timeline kaya
 * (reasoning/tool/parts terurut) = Slice 6.3. */
export function MessageList({ messages, pending }: { messages: ChatBubble[]; pending?: boolean }) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <SparklesIcon className="size-6 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Mulai percakapan dengan Astra.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: ChatBubble }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
          <SparklesIcon className="size-4 text-muted-foreground" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "border bg-muted/40",
        )}
      >
        {message.text || (isUser ? "" : "…")}
      </div>
    </div>
  );
}
