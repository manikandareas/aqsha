"use client";

import { PlusIcon } from "lucide-react";
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from "@/components/ai-elements/prompt-input";

export function ComposerContextMenu({
  threadId,
  disabled,
  isDeepActive,
  mode,
}: {
  threadId?: string;
  disabled: boolean;
  isDeepActive: boolean;
  mode: "normal" | "deep";
}) {
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger
        tooltip="Tambah konteks"
        disabled={mode === "deep" || !threadId || disabled || isDeepActive}
        className="aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 active:scale-95"
      >
        <PlusIcon className="size-4" />
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        <PromptInputActionMenuItem disabled>
          <PlusIcon className="mr-2 size-4" />
          Tambah konteks thread
        </PromptInputActionMenuItem>
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}
