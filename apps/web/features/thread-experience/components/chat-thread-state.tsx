"use client";

import { useSmoothText, useUIMessages } from "@convex-dev/agent/react";
import {
  uiHitlMessageFromInteraction,
  uiMessageFromV2Row,
  type V2InteractionRow,
  type V2MessageRow,
} from "@aqsha/agent-contracts";
import { AlertCircleIcon } from "@aqsha/ui/icons";
import { api } from "@aqsha/convex/api";
import { isSdkBackend } from "@/lib/agent-backend";
import { useConvexAuth, useConvexQueryData } from "@/lib/convex-query";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  panelBodyPaddingClass,
  panelComposerPaddingClass,
  threadTranscriptBodyPaddingClass,
  threadTranscriptColumnClass,
  threadTranscriptComposerPaddingClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  RateStatus,
  ResearchArtifact,
  ResearchRun,
  ResearchSource,
} from "../types";
import {
  entryGapClass,
  interleavedEntryKey,
  interleaveRunsWithMessages,
  isRunActive,
  sortTranscriptMessages,
} from "../utils/transcript-model";
import { getSourceCountsByOwner } from "../utils/research-panel-model";
import type {
  DraftContextArtifact,
  SendMessage,
  StartThread,
  ThreadSummary,
} from "./component-types";
import { Composer } from "./composer";
import { EmptyThreadCopy, HomeStartState } from "./home-states";
import { type AgentRunId } from "@/lib/convex-refs";
import { hasPendingHitl } from "../utils/hitl-parts";
import { useHitlResume } from "./use-hitl-resume";
import { MessageRow } from "./message-row";
import { AgentRunBlock } from "./run-progress";
import { CenteredLoading } from "./shared";

const emptyContextArtifacts: DraftContextArtifact[] = [];
const emptyThreadSummaries: ThreadSummary[] = [];
const emptyRuns: ResearchRun[] = [];
const emptyArtifacts: ResearchArtifact[] = [];
const emptySources: ResearchSource[] = [];
const cancelNoop = async () => undefined;

export function ThreadChatSurface({
  threadId,
  isLoading,
  title,
  rateStatus,
  startThread,
  onSend,
  runs = emptyRuns,
  artifacts = emptyArtifacts,
  sources = emptySources,
  onCancelRun = cancelNoop,
  onRetryRun,
  compact = false,
  contextArtifacts = emptyContextArtifacts,
  onRemoveContextArtifact,
  threadWorkspaceId,
  threads = emptyThreadSummaries,
  onThreadCreated,
  draftContextLabel,
  seed,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  startThread: StartThread;
  onSend?: SendMessage;
  runs?: ResearchRun[];
  artifacts?: ResearchArtifact[];
  sources?: ResearchSource[];
  onCancelRun?: (runId: string) => Promise<unknown>;
  onRetryRun?: (args: { runId: AgentRunId }) => Promise<unknown>;
  compact?: boolean;
  contextArtifacts?: DraftContextArtifact[];
  onRemoveContextArtifact?: (artifactId: string) => void;
  threadWorkspaceId?: string;
  threads?: ThreadSummary[];
  onThreadCreated?: (threadId: string) => void;
  draftContextLabel?: string;
  seed?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  // Backend split (plan §9.4 Step 2): both query sets always run, the
  // inactive backend gets "skip" — components below see one message shape.
  const legacyActive = isAuthenticated && !isSdkBackend;
  const sdkActive = isAuthenticated && isSdkBackend;
  const threadStatusLegacy = useConvexQueryData(
    api.agent.threads.get,
    legacyActive && threadId ? { threadId } : "skip",
  );
  const threadStatusV2 = useConvexQueryData(
    api.agent.v2.queries.getThread,
    sdkActive && threadId ? { threadId } : "skip",
  );
  const threadStatus = isSdkBackend ? threadStatusV2 : threadStatusLegacy;
  // Lock the composer while a reply is still being generated for this thread.
  // `send` only schedules generation and returns immediately, so `isSending`
  // alone re-opens the composer before the agent finishes streaming.
  const isGenerating = threadStatus?.status === "streaming";
  const messages = useUIMessages(
    api.agent.messages.list,
    legacyActive && threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );
  const v2MessageRows = useConvexQueryData(
    api.agent.v2.queries.listMessages,
    sdkActive && threadId ? { threadId } : "skip",
  );
  const v2Interactions = useConvexQueryData(
    api.agent.v2.queries.listPendingInteractions,
    sdkActive && threadId ? { threadId } : "skip",
  );
  const rawBackendMessages = isSdkBackend
    ? ([
        ...((v2MessageRows ?? []) as V2MessageRow[]).map(uiMessageFromV2Row),
        ...((v2Interactions ?? []) as V2InteractionRow[]).map(
          uiHitlMessageFromInteraction,
        ),
      ] as unknown as ChatMessage[])
    : (messages.results as unknown as ChatMessage[]);
  // The sdk backend delivers text in ~RTT-sized jumps (one Convex write per
  // round-trip); smooth the in-flight assistant message client-side so it
  // reads like token streaming — the same trick useUIMessages does natively
  // on the legacy backend.
  const streamingV2 = isSdkBackend
    ? rawBackendMessages.find(
        (message) => message.role === "assistant" && message.status === "streaming",
      )
    : undefined;
  const [smoothedText] = useSmoothText(streamingV2?.text ?? "", {
    startStreaming: true,
  });
  const backendMessages = streamingV2
    ? rawBackendMessages.map((message) =>
        message === streamingV2
          ? {
              ...message,
              text: smoothedText,
              parts: [{ type: "text", text: smoothedText }],
            }
          : message,
      )
    : rawBackendMessages;
  const sortedMessages = sortTranscriptMessages(backendMessages);
  // HITL is now native in-thread: a pending tool part (askUser awaiting an
  // answer, or an action awaiting approval) blocks the composer, and resolving
  // it resumes generation. Derived entirely from the message stream.
  const pendingHitl = hasPendingHitl(sortedMessages);
  const hitlBlocking = pendingHitl;
  const hitlActions = useHitlResume(threadId, pendingHitl);
  const hasMessages = sortedMessages.length > 0;
  const activeRun = runs.find(isRunActive);
  const interleavedEntries = interleaveRunsWithMessages(sortedMessages, runs);
  const sourceCounts = getSourceCountsByOwner(sources);

  if (!threadId && !hasMessages && runs.length === 0) {
    return (
      <HomeStartState
        rateStatus={rateStatus}
        startThread={startThread}
        threads={threads}
        contextArtifacts={contextArtifacts}
        onRemoveContextArtifact={onRemoveContextArtifact}
        onThreadCreated={onThreadCreated}
        contextLabel={draftContextLabel}
        seed={seed}
        compact={compact}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <ConversationContent
          className={cn(
            "gap-6 overflow-x-hidden p-0",
            compact ? cn("max-w-none", panelBodyPaddingClass) : cn(threadTranscriptColumnClass, threadTranscriptBodyPaddingClass),
          )}
        >
          <div className="flex w-full min-w-0 flex-col overflow-x-hidden">
            {isLoading ? (
              <CenteredLoading label="Memuat thread..." />
            ) : hasMessages || runs.length > 0 ? (
              <>
                {interleavedEntries.map((entry, index) => {
                  const previous = interleavedEntries[index - 1];
                  return (
                    <div
                      key={interleavedEntryKey(entry)}
                      className={cn(
                        "min-w-0",
                        index === 0 ? "mt-0" : entryGapClass(previous, entry),
                      )}
                    >
                      {entry.kind === "run" ? (
                        <AgentRunBlock
                          run={entry.run}
                          artifacts={artifacts ?? []}
                          sourceCount={sourceCounts.byRunId.get(entry.run._id) ?? 0}
                          sources={sources.filter(
                            (source) => source.runId === entry.run._id,
                          )}
                        />
                      ) : (
                        <MessageRow
                          message={entry.message}
                          assistantRun={entry.assistantRun}
                          onRetryRun={onRetryRun}
                          sourceCount={sourceCounts.byMessageId.get(entry.message.id) ?? 0}
                          threadWorkspaceId={threadWorkspaceId}
                          hitlActions={hitlActions}
                          hitlDisabled={isGenerating}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : messages.status === "LoadingFirstPage" && threadId ? (
              <CenteredLoading label="Memuat pesan..." />
            ) : (
              <ConversationEmptyState className={compact ? "min-h-[24svh]" : "min-h-[48svh]"}>
                <EmptyThreadCopy title={title} />
              </ConversationEmptyState>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="bottom-4 size-8 border-border/70 bg-card/85 text-muted-foreground shadow-none" />
      </Conversation>
      <div
        className={cn(
          "shrink-0 min-w-0 overflow-x-hidden bg-background",
          compact ? panelComposerPaddingClass : threadTranscriptComposerPaddingClass,
        )}
      >
        <div className={cn(compact ? "mx-auto w-full max-w-none" : threadTranscriptColumnClass)}>
          {threadId && threadStatus?.status === "failed" ? (
            <div className="mb-2 flex items-start gap-2 rounded-[10px] border border-coral-soft-border bg-coral-soft px-3 py-2.5 text-[12px] font-medium leading-5 text-coral-foreground">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>Respons terakhir gagal diproses. Coba kirim pesan lagi.</span>
            </div>
          ) : null}
          {threadId && onSend ? (
            <Composer
              mode="thread"
              variant="docked"
              threadId={threadId}
              disabled={isLoading}
              rateStatus={rateStatus}
              activeRun={activeRun}
              onCancelRun={onCancelRun}
              onStartThread={startThread}
              onSend={onSend}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
              hitlBlocking={hitlBlocking}
              isGenerating={isGenerating}
              initialAgentKind={threadStatus?.lastAgentKind}
            />
          ) : (
            <Composer
              mode="draft"
              variant="docked"
              disabled={isLoading}
              rateStatus={rateStatus}
              onStartThread={startThread}
              contextArtifacts={contextArtifacts}
              onRemoveContextArtifact={onRemoveContextArtifact}
            />
          )}
        </div>
      </div>
    </div>
  );
}
