"use client";

import { ChevronDownIcon, ImageIcon, SendHorizonalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { pendingPromptKey } from "@/features/chat/lib/pending-prompt";
import { useCreateChatThreadMutation } from "@/features/chat/lib/queries";
import { getEdenErrorMessage } from "@/lib/eden-error";
import { toast } from "@/lib/toast";

const quickQuestions = ["Create an Automation", "Run security audit"];

export function NewThreadComposer() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const createThreadMutation = useCreateChatThreadMutation();
  const isSubmitting = createThreadMutation.isPending;

  async function handleSend(text: string) {
    const prompt = text.trim();

    if (!prompt || isSubmitting) {
      return;
    }

    try {
      const thread = await createThreadMutation.mutateAsync();
      sessionStorage.setItem(pendingPromptKey(thread.id), prompt);
      router.push(`/app/threads/${thread.id}`);
    } catch (cause) {
      toast.error({
        title: "Could not start conversation",
        description: getEdenErrorMessage(
          cause,
          "Conversation start failed. Try again.",
        ),
      });
    }
  }

  return (
    <div className="min-h-full bg-background px-4 py-12 text-foreground sm:px-6 lg:px-8 lg:py-20 flex items-center justify-center">
      <div className="mx-auto w-full max-w-[720px]">
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(input);
          }}
        >
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask Aqsha to build, fix bugs, explore"
            disabled={isSubmitting}
            className="min-h-24 sm:min-h-28"
          />

          <PromptInputToolbar>
            <PromptInputTools className="gap-2 text-xs text-muted-foreground sm:text-sm">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground"
              >
                Codex 5.3 High
                <ChevronDownIcon className="size-3.5" />
              </button>

              <div className="flex -space-x-1.5">
                <span className="grid size-6 place-items-center rounded-full border border-card bg-primary text-[10px] font-semibold text-primary-foreground">
                  A
                </span>
                <span className="grid size-6 place-items-center rounded-full border border-card bg-badge-bg text-[10px] font-semibold text-badge-foreground">
                  C
                </span>
                <span className="grid size-6 place-items-center rounded-full border border-card bg-muted text-[10px] font-semibold text-muted-foreground">
                  G
                </span>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground"
              >
                <ChevronDownIcon className="size-3.5" />
              </button>
            </PromptInputTools>

            <PromptInputTools className="gap-2 text-muted-foreground">
              <button
                type="button"
                className="rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Attach image"
              >
                <ImageIcon className="size-4" />
              </button>
              <PromptInputSubmit
                disabled={isSubmitting || input.trim().length === 0}
                aria-label="Send message"
              >
                <SendHorizonalIcon className="size-3.5" />
              </PromptInputSubmit>
            </PromptInputTools>
          </PromptInputToolbar>
        </PromptInput>

        <Suggestions className="mt-3">
          {quickQuestions.map((question) => (
            <Suggestion
              key={question}
              suggestion={question}
              onClick={setInput}
              disabled={isSubmitting}
              className="bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          ))}
        </Suggestions>
      </div>
    </div>
  );
}
