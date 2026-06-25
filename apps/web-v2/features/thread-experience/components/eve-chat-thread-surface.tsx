"use client";

import type { EveAgentReducerEvent } from "eve/react";
import { useMemo } from "react";
import {
  panelBodyPaddingClass,
  threadTranscriptBodyPaddingClass,
  threadTranscriptColumnClass,
  threadTranscriptComposerPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { useThread, useThreadEvents, useThreadMessages } from "@/features/threads/api";
import { ChatSurface } from "@/features/threads/components/chat-surface";
import {
  chatMessagesToTimeline,
  isStreamActive,
  recoverPending,
  streamIndexFromEvents,
  type TimelineMessage,
} from "@/features/threads/lib/eve-timeline";
import type { ChatMessage, ChatThreadEvent } from "@/features/threads/types";
import type { DraftContextArtifact, ThreadSummary } from "./component-types";
import { CenteredLoading } from "./shared";
import type { RateStatus } from "../types";

/**
 * Prefix history thread PRA-event (pasca-mig 0014 / legacy): hanya `chat_messages` (teks + reasoning),
 * tanpa event log. Turn yang SUDAH punya event di-skip (turnId hadir di event log) → tak dobel dengan
 * jalur event-level di `ChatSurface`. Kosong untuk thread normal (semua turn ber-event).
 */
function legacyHistory(
  events: readonly ChatThreadEvent[],
  messages: readonly ChatMessage[],
): TimelineMessage[] {
  if (messages.length === 0) return [];
  const eventTurnIds = new Set(events.map((e) => e.turnId).filter(Boolean));
  return chatMessagesToTimeline(messages).filter((m) => !m.turnId || !eventTurnIds.has(m.turnId));
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
  // Event stream eve persisted (1:1) = sumber timeline reload + cursor resume. `useThreadMessages`
  // = fallback thread LAMA (pra-event). `useThread` = resume handle (continuationToken) + pending.
  const eventsQuery = useThreadEvents(threadId ?? "", Boolean(threadId));
  const messagesQuery = useThreadMessages(threadId ?? "", Boolean(threadId));
  const threadDetail = useThread(threadId ?? "", Boolean(threadId));
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // Log mentah = SATU sumber timeline (event-level overlay di ChatSurface). Tak ada lagi
  // splitActiveTurn: turn aktif & selesai di log yang sama; resume melanjutkan dari ekornya.
  const initialEvents = useMemo<EveAgentReducerEvent[]>(
    () => events.map((e) => e.payload as EveAgentReducerEvent),
    [events],
  );
  const legacy = useMemo(
    () => legacyHistory(events, messagesQuery.data ?? []),
    [events, messagesQuery.data],
  );

  if (!threadId) {
    return <ChatSurface compact={compact} seed={seed} />;
  }

  // Tunggu threadDetail JUGA: useEveAgent membaca initialSession SEKALI saat dibuat, jadi
  // continuationToken harus sudah ada sebelum ChatSurface mount.
  if (isLoading || eventsQuery.isLoading || messagesQuery.isLoading || threadDetail.isLoading) {
    return (
      <div className={cn(threadTranscriptColumnClass, threadTranscriptBodyPaddingClass)}>
        <CenteredLoading label="Memuat thread..." />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <main
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden",
          compact ? cn("max-w-none", panelBodyPaddingClass) : undefined,
        )}
      >
        <ChatSurface
          initialSession={{
            sessionId: threadId,
            // Cursor stream eve = max(event_index)+1 (1:1) — resume-stream turn aktif + follow-up send.
            streamIndex: streamIndexFromEvents(events),
            continuationToken: threadDetail.data?.continuationToken ?? undefined,
          }}
          initialEvents={initialEvents}
          legacyHistory={legacy}
          streamActive={isStreamActive(events)}
          pendingUserMessage={recoverPending(
            events,
            threadDetail.data?.pendingUserMessage,
            threadDetail.data?.pendingUserMessageCreatedAt,
          )}
        />
      </main>
      <div
        className={cn("sr-only", compact ? undefined : threadTranscriptComposerPaddingClass)}
        aria-hidden
      >
        {title}
      </div>
    </div>
  );
}
