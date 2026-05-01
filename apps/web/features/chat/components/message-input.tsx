"use client";

import { SendHorizonalIcon, StopCircleIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

export function MessageInput({
  disabled,
  isStreaming,
  onSend,
  onStop,
  className,
}: {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  className?: string;
}) {
  const [input, setInput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || disabled) {
      return;
    }

    onSend(text);
    setInput("");
  }

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className={cn("mx-auto w-full max-w-[820px]", className)}
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
        placeholder="Add a follow up"
        disabled={disabled}
        className="min-h-20 sm:min-h-24"
      />
      <PromptInputToolbar>
        <PromptInputTools className="gap-2 text-sm text-muted-foreground">
          <span>Enter to send, Shift+Enter for a new line</span>
        </PromptInputTools>

        <PromptInputTools className="gap-2 text-muted-foreground">
          {isStreaming ? (
            <PromptInputSubmit
              type="button"
              onClick={onStop}
              aria-label="Stop streaming"
            >
              <StopCircleIcon className="size-3.5" />
            </PromptInputSubmit>
          ) : (
            <PromptInputSubmit
              disabled={disabled || input.trim().length === 0}
              aria-label="Send message"
            >
              <SendHorizonalIcon className="size-3.5" />
            </PromptInputSubmit>
          )}
        </PromptInputTools>
      </PromptInputToolbar>
    </PromptInput>
  );
}
