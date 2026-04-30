"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MessageInput } from "@/features/chat/components/message-input";
import { createChatThread } from "@/features/chat/lib/api";
import { pendingPromptKey } from "@/features/chat/lib/pending-prompt";

export function NewThreadComposer() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSend(text: string) {
    setIsSubmitting(true);

    try {
      const thread = await createChatThread();
      sessionStorage.setItem(pendingPromptKey(thread.id), text);
      router.push(`/app/threads/${thread.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl rounded-[28px] border border-border bg-[#f6f5f4]/60 px-4 py-8 shadow-sm sm:px-8 sm:py-12 lg:px-10">
          <div className="mx-auto w-full max-w-3xl space-y-8 text-center">
            <div className="space-y-4">
              <p className="mx-auto w-fit rounded-full bg-badge-bg px-2 py-1 text-xs font-semibold tracking-badge text-badge-foreground">
                Temporary thread
              </p>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold leading-tight tracking-[-0.625px] text-foreground sm:text-5xl sm:tracking-[-1.5px]">
                  What can I help with?
                </h1>
                <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Start with a question, idea, or rough note. Your first message creates a temporary thread and opens the conversation.
                </p>
              </div>
            </div>

            <MessageInput
              disabled={isSubmitting}
              isStreaming={false}
              onSend={handleSend}
              onStop={() => undefined}
              className="px-0 pb-0"
            />

            <div className="grid gap-2 text-left sm:grid-cols-3">
              {["Draft a plan", "Explain an idea", "Brainstorm next steps"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void handleSend(label)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
