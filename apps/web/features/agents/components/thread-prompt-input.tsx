"use client";

import * as React from "react";
import { ArrowUpIcon, DatabaseIcon, Loader2Icon, SparklesIcon } from "lucide-react";

import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import type { AgentDepthMode } from "@/features/agents/lib/types";

type ThreadPromptInputProps = {
  placeholder?: string;
  disabled?: boolean;
  defaultDepthMode?: AgentDepthMode;
  onSubmit: (input: { content: string; depthMode: AgentDepthMode }) => Promise<void>;
};

export function ThreadPromptInput({
  placeholder = "Ask a research question...",
  disabled,
  defaultDepthMode = "standard",
  onSubmit,
}: ThreadPromptInputProps) {
  const [content, setContent] = React.useState("");
  const [depthMode, setDepthMode] = React.useState<AgentDepthMode>(defaultDepthMode);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canSubmit = content.trim().length > 0 && !disabled && !isSubmitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const prompt = content.trim();
    setIsSubmitting(true);

    try {
      setContent("");
      await onSubmit({ content: prompt, depthMode });
    } catch {
      setContent(prompt);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className="rounded-3xl border bg-card/95 p-3 shadow-2xl backdrop-blur-md"
    >
      <PromptInputTextarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSubmitting}
      />
      <PromptInputToolbar>
        <PromptInputTools>
          <Button
            type="button"
            size="sm"
            variant={depthMode === "standard" ? "pill" : "ghost"}
            onClick={() => setDepthMode("standard")}
            disabled={disabled || isSubmitting}
            className="rounded-full"
          >
            <SparklesIcon className="size-3.5" />
            Standard
          </Button>
          <Button
            type="button"
            size="sm"
            variant={depthMode === "deep" ? "pill" : "ghost"}
            onClick={() => setDepthMode("deep")}
            disabled={disabled || isSubmitting}
            className="rounded-full"
          >
            <DatabaseIcon className="size-3.5" />
            Deep
          </Button>
        </PromptInputTools>
        <PromptInputSubmit disabled={!canSubmit} aria-label="Send message">
          {isSubmitting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ArrowUpIcon className="size-4" />
          )}
        </PromptInputSubmit>
      </PromptInputToolbar>
    </PromptInput>
  );
}
