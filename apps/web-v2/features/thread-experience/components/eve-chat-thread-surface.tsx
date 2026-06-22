"use client";

import { useMemo } from "react";
import {
  panelBodyPaddingClass,
  threadTranscriptBodyPaddingClass,
  threadTranscriptColumnClass,
  threadTranscriptComposerPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useThread, useThreadMessages, useSendStatus } from "@/features/threads/api";
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
  // Resume handle eve (dipersist channel saat `session.waiting`). Wajib untuk follow-up
  // di thread yang di-reload — eve menolak continue tanpa continuationToken.
  const threadDetail = useThread(threadId ?? "", Boolean(threadId));

  if (!threadId) {
    return <ChatSurface compact={compact} seed={seed} />;
  }

  // Tunggu threadDetail JUGA: useEveAgent membaca initialSession SEKALI saat dibuat, jadi
  // continuationToken harus sudah ada sebelum ChatSurface mount (kalau telat, store keburu
  // dibuat tanpa token → follow-up gagal).
  if (isLoading || historyQuery.isLoading || threadDetail.isLoading) {
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
          initialSession={{
            sessionId: threadId,
            streamIndex: history.length,
            continuationToken: threadDetail.data?.continuationToken ?? undefined,
          }}
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
