"use client";

import { SendIcon, StopCircleIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <form
      onSubmit={handleSubmit}
      className={cn("mx-auto w-full max-w-3xl px-4 pb-5 sm:px-6", className)}
    >
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm transition-shadow focus-within:shadow-md">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask anything..."
          disabled={disabled}
          className="max-h-48 min-h-24 resize-none border-0 bg-transparent px-3 py-3 text-sm leading-6 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between border-t border-border/60 px-2 pt-2">
          <span className="text-xs text-muted-foreground">Enter to send, Shift+Enter for a new line</span>
          {isStreaming ? (
            <Button type="button" variant="outline" size="sm" onClick={onStop}>
              <StopCircleIcon className="size-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={disabled || input.trim().length === 0}>
              <SendIcon className="size-4" />
              Send
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
