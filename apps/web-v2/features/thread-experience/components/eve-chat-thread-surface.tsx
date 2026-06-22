"use client";

import { useMemo } from "react";
import {
  panelBodyPaddingClass,
  threadTranscriptBodyPaddingClass,
  threadTranscriptColumnClass,
  threadTranscriptComposerPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useThreadMessages, useSendStatus } from "@/features/threads/api";
import { ChatSurface } from "@/features/threads/components/chat-surface";
import { chatMessagesToTimeline } from "@/features/threads/lib/eve-timeline";
import type { DraftContextArtifact, ThreadSummary } from "./component-types";
import { CenteredLoading } from "./shared";
import type { RateStatus } from "../types";

function historyToTimeline(messages: Awaited<ReturnType<typeof useThreadMessages>>["data"]) {
  if (!messages) return [];
  return chatMessagesToTimeline(messages);
}

export function EveChatThreadSurface({
  threadId,
  isLoading,
  title,
  compact = false,
  threads = [],
  contextArtifacts = [],
  onRemoveContextArtifact,
  seed,
  draftContextLabel,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus?: RateStatus;
  compact?: boolean;
  threads?: ThreadSummary[];
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  seed?: string;
  draftContextLabel?: string;
}) {
  const sendStatus = useSendStatus();
  const historyQuery = useThreadMessages(threadId ?? "", Boolean(threadId));
  const history = useMemo(() => historyToTimeline(historyQuery.data), [historyQuery.data]);

  if (!threadId) {
    return <ChatSurface compact={compact} seed={seed} />;
  }

  if (isLoading || historyQuery.isLoading) {
    return <CenteredLoading label="Memuat thread..." />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <main
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden",
          compact
            ? cn("max-w-none", panelBodyPaddingClass)
            : cn(threadTranscriptColumnClass, threadTranscriptBodyPaddingClass),
        )}
      >
        <ChatSurface
          initialSession={{ sessionId: threadId, streamIndex: history.length }}
          history={history}
        />
      </main>
      <div
        className={cn(
          "sr-only",
          compact ? undefined : threadTranscriptComposerPaddingClass,
        )}
        aria-hidden
      >
        {title}
      </div>
    </div>
  );
}
