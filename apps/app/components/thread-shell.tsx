"use client";

import { useUIMessages } from "@convex-dev/agent/react";
import type { OptimisticLocalStore } from "convex/browser";
import { insertAtTop, useConvexAuth, useMutation, useQuery } from "convex/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@aqsha/convex/api";
import {
  promptCommands,
  type PromptCommand,
} from "@aqsha/convex/prompt-commands";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import {
  Sources,
  Source,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { AppSidebar } from "@/components/app-sidebar";
import {
  ResearchSidebar,
  type ResearchSource,
} from "@/components/sources-panel";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SendResult =
  | {
      ok: true;
      threadId?: string;
      messageId: string;
      runId?: string;
      workflowId?: string;
    }
  | { ok: false; reason: "rate_limited"; retryAt: number };

type RateStatus = {
  ok: boolean;
  retryAt: number | null;
  serverTime: number;
};

type ChatMessage = {
  id: string;
  key: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "pending" | "success" | "failed" | "streaming";
  order: number;
  stepOrder: number;
  text?: string;
  parts?: Array<{ type: string; text?: string }>;
  metadata?: {
    promptCommand?: PromptCommandMetadata;
  };
};

type PromptCommandMetadata = {
  commandId: string;
  commandLabel: string;
  commandSlug: string;
  mode: "normal" | "deep";
  argumentPreview: string;
};

function optimisticallyInsertUserMessage(
  store: OptimisticLocalStore,
  args: {
    threadId: string;
    text: string;
    promptCommand?: PromptCommandMetadata;
  },
) {
  const queries = store.getAllQueries(api.agent.messages.list);
  let maxOrder = -1;
  for (const query of queries) {
    if (query.args?.threadId !== args.threadId) continue;
    if (query.args.streamArgs) continue;
    for (const message of query.value?.page ?? []) {
      maxOrder = Math.max(maxOrder, message.order);
    }
  }
  const order = maxOrder + 1;
  const stepOrder = 0;
  const id = randomId();
  insertAtTop({
    paginatedQuery: api.agent.messages.list,
    argsToMatch: { threadId: args.threadId, streamArgs: undefined },
    item: {
      _creationTime: Date.now(),
      id,
      key: `${args.threadId}-${order}-${stepOrder}`,
      order,
      stepOrder,
      status: "pending",
      parts: [{ type: "text", text: args.text }],
      role: "user",
      text: args.text,
      metadata: args.promptCommand
        ? { promptCommand: args.promptCommand }
        : undefined,
    },
    localQueryStore: store,
  });
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function previewFromComposerContent(content: string, command: PromptCommand) {
  const argument = stripCommandFromContent(content, command);
  const singleLine = argument.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function stripCommandFromContent(content: string, command: PromptCommand) {
  const trimmed = content.trim();
  const slugs = [command.slug, ...command.aliases].sort((a, b) => b.length - a.length);
  for (const slug of slugs) {
    if (trimmed === slug) return "";
    if (trimmed.startsWith(`${slug} `) || trimmed.startsWith(`${slug}\n`)) {
      return trimmed.slice(slug.length).trim();
    }
  }
  return trimmed;
}

type ResearchRun = {
  _id: string;
  promptMessageId?: string;
  mode: "normal" | "deep";
  executionKind: "inline" | "workflow";
  status:
    | "queued"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "canceled";
  currentStep?: string;
  activeArtifactId?: string;
  retryable: boolean;
  errorMessage?: string;
  createdAt?: number;
  completedAt?: number;
  canceledAt?: number;
  steps: Array<{
    stepKey: string;
    label: string;
    order: number;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    summary?: string;
    sourceCount?: number;
    artifactCount?: number;
    failureReason?: string;
    startedAt?: number;
    completedAt?: number;
  }>;
  events: Array<{
    _id: string;
    stepKey?: string;
    eventType:
      | "plan"
      | "gap"
      | "query"
      | "search"
      | "read"
      | "rerank"
      | "audit"
      | "tool"
      | "artifact"
      | "status"
      | "failure";
    round?: number;
    title: string;
    summary: string;
    metadataJson?: string;
    createdAt: number;
  }>;
};

type ResearchArtifact = {
  _id: string;
  runId?: string;
  type:
    | "research_report"
    | "markdown_report"
    | "research_document"
    | "source_bundle"
    | "citation_evidence_view"
    | "document"
    | "code"
    | "html"
    | "json"
    | "plain_text";
  title: string;
  currentVersionId?: string;
  version?: {
    _id: string;
    versionNumber: number;
    contentFormat: "markdown" | "html" | "plain" | "code" | "json";
    title: string;
    body?: string;
    changeSummary?: string;
    createdAt: number;
  } | null;
  createdAt: number;
};

export function ThreadShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated
      ? {
          paginationOpts: { cursor: null, numItems: 50 },
        }
      : "skip",
  );
  const selectedThread = useQuery(
    api.agent.threads.get,
    isAuthenticated && threadId ? { threadId } : "skip",
  );
  const startThread = useMutation(api.agent.messages.startThread);
  const sendMessage = useMutation(api.agent.messages.send).withOptimisticUpdate(
    (store, args) => {
      const command = args.commandId
        ? promptCommands.find((item) => item.id === args.commandId)
        : undefined;
      const promptCommand = command
        ? {
            commandId: command.id,
            commandLabel: command.label,
            commandSlug: command.slug,
            mode: command.mode,
            argumentPreview: previewFromComposerContent(args.content, command),
          }
        : undefined;
      optimisticallyInsertUserMessage(store, {
        threadId: args.threadId,
        text: args.content,
        promptCommand,
      });
    },
  );
  const rateStatus = useQuery(
    api.agent.rateLimits.getSendStatus,
    isAuthenticated ? {} : "skip",
  );
  const sources = useQuery(
    api.agent.sources.list,
    isAuthenticated && threadId ? { threadId } : "skip",
  );
  const runs = useQuery(
    api.agent.deepResearch.listForThread,
    isAuthenticated && threadId ? { threadId } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useQuery(
    api.agent.artifacts.list,
    isAuthenticated && threadId ? { threadId } : "skip",
  ) as ResearchArtifact[] | undefined;
  const cancelRun = useMutation(api.agent.deepResearch.cancel);
  const retryRun = useMutation(api.agent.deepResearch.retry);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<"sources" | "artifacts">(
    "sources",
  );
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [seenArtifactCount, setSeenArtifactCount] = useState(0);
  const selectedArtifactId = activeArtifactId ?? artifacts?.[0]?._id ?? null;
  const activeArtifact = useQuery(
    api.agent.artifacts.get,
    isAuthenticated && selectedArtifactId
      ? { artifactId: selectedArtifactId as never }
      : "skip",
  ) as ResearchArtifact | null | undefined;
  const threads = threadPage?.page ?? [];
  const title = threadId
    ? (selectedThread?.title ?? "Thread tidak ditemukan")
    : "Thread baru";

  const hasResearchPayload =
    (sources && sources.length > 0) ||
    (artifacts && artifacts.length > 0) ||
    (runs ?? []).some(isRunActive);
  const artifactCount = artifacts?.length ?? 0;
  const hasUnseenArtifact = artifactCount > seenArtifactCount;
  const effectiveRightPanelTab = hasUnseenArtifact ? "artifacts" : rightPanelTab;
  const effectiveRightPanelOpen =
    Boolean(hasResearchPayload) && (rightPanelOpen || hasUnseenArtifact);

  const handleCreateThread = () => {
    router.push("/");
  };

  const handleOpenArtifact = (artifactId: string) => {
    setActiveArtifactId(artifactId);
    setRightPanelTab("artifacts");
    setSeenArtifactCount(artifactCount);
    setRightPanelOpen(true);
  };

  const handleRightPanelOpenChange = (open: boolean) => {
    setRightPanelOpen(open);
    if (!open) {
      setSeenArtifactCount(artifactCount);
    }
  };

  const handleRightPanelTabChange = (tab: "sources" | "artifacts") => {
    setRightPanelTab(tab);
    setSeenArtifactCount(artifactCount);
  };

  const handleCancelRun = async (runId: string) => {
    try {
      await cancelRun({ runId: runId as never });
    } catch (error) {
      console.error("Failed to cancel deep research run", error);
    }
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-mobile": "17.5rem",
        } as CSSProperties
      }
      className="h-svh max-h-svh overflow-hidden"
    >
      <ThreadShellLayout
        viewer={viewer}
        threads={threads}
        selectedThreadId={threadId}
        onCreateThread={handleCreateThread}
        hasResearchPayload={Boolean(hasResearchPayload)}
        title={title}
        threadId={threadId}
        selectedThread={selectedThread}
        rateStatus={rateStatus}
        startThread={startThread}
        sendMessage={sendMessage}
        sources={sources ?? []}
        runs={runs ?? []}
        artifacts={artifacts ?? []}
        activeArtifact={activeArtifact ?? null}
        activeCitation={activeCitation}
        onCitationClick={setActiveCitation}
        rightPanelOpen={effectiveRightPanelOpen}
        rightPanelTab={effectiveRightPanelTab}
        onRightPanelOpenChange={handleRightPanelOpenChange}
        onRightPanelTabChange={handleRightPanelTabChange}
        onOpenArtifact={handleOpenArtifact}
        onCancelRun={handleCancelRun}
        onRetryRun={(runId) => retryRun({ runId: runId as never })}
      />
    </SidebarProvider>
  );
}

function ThreadShellLayout({
  viewer,
  threads,
  selectedThreadId,
  onCreateThread,
  hasResearchPayload,
  title,
  threadId,
  selectedThread,
  rateStatus,
  startThread,
  sendMessage,
  sources,
  runs,
  artifacts,
  activeArtifact,
  activeCitation,
  onCitationClick,
  rightPanelOpen,
  rightPanelTab,
  onRightPanelOpenChange,
  onRightPanelTabChange,
  onOpenArtifact,
  onCancelRun,
  onRetryRun,
}: {
  viewer: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | undefined;
  threads: Array<{
    threadId: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  selectedThreadId?: string;
  onCreateThread: () => void;
  hasResearchPayload: boolean;
  title: string;
  threadId?: string;
  selectedThread:
    | {
        title: string;
      }
    | null
    | undefined;
  rateStatus: RateStatus | undefined;
  startThread: (args: {
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  sendMessage: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  activeArtifact: ResearchArtifact | null;
  activeCitation: number | null;
  onCitationClick: (citation: number) => void;
  rightPanelOpen: boolean;
  rightPanelTab: "sources" | "artifacts";
  onRightPanelOpenChange: (open: boolean) => void;
  onRightPanelTabChange: (tab: "sources" | "artifacts") => void;
  onOpenArtifact: (artifactId: string) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <>
      <AppSidebar
        viewer={viewer}
        threads={threads}
        selectedThreadId={selectedThreadId}
        onCreateThread={onCreateThread}
      />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-background">
        <SidebarProvider
          open={rightPanelOpen}
          onOpenChange={onRightPanelOpenChange}
          style={
            {
              "--sidebar-width": "52rem",
              "--sidebar-width-mobile": "34rem",
            } as CSSProperties
          }
          className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden bg-background">
            <ThreadHeader
              title={title}
              showLeftTrigger={!isLeftSidebarOpen}
              onToggleLeftSidebar={leftSidebar.toggleSidebar}
              showRightTrigger={hasResearchPayload}
            />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {threadId && selectedThread === null ? (
                <AccessDeniedState />
              ) : (
                <ChatThreadState
                  threadId={threadId}
                  isLoading={threadId ? selectedThread === undefined : false}
                  title={threadId ? selectedThread?.title : undefined}
                  recentThreads={threads.slice(0, 3)}
                  rateStatus={rateStatus}
                  startThread={startThread}
                  onSend={sendMessage}
                  sources={sources}
                  runs={runs}
                  artifacts={artifacts}
                  onCitationClick={onCitationClick}
                  onOpenArtifact={onOpenArtifact}
                  onCancelRun={onCancelRun}
                  onRetryRun={onRetryRun}
                />
              )}
            </main>
          </SidebarInset>
          {hasResearchPayload ? (
            <ResearchSidebar
              threadTitle={threadId ? selectedThread?.title : undefined}
              sources={sources}
              artifacts={artifacts}
              activeArtifact={activeArtifact ?? null}
              activeTab={rightPanelTab}
              activeCitation={activeCitation}
              onTabChange={onRightPanelTabChange}
              onOpenArtifact={onOpenArtifact}
              onClosePanel={() => onRightPanelOpenChange(false)}
            />
          ) : null}
        </SidebarProvider>
      </SidebarInset>
    </>
  );
}

function ThreadHeader({
  title,
  showLeftTrigger,
  onToggleLeftSidebar,
  showRightTrigger,
}: {
  title: string;
  showLeftTrigger: boolean;
  onToggleLeftSidebar: () => void;
  showRightTrigger: boolean;
}) {
  return (
    <header className="flex h-9 shrink-0 items-center justify-between gap-2 bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        {showLeftTrigger ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ml-1 size-7 rounded-[7px] text-muted-foreground"
            onClick={onToggleLeftSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-4" />
          </Button>
        ) : null}
        <h1 className="max-w-[34vw] truncate text-[13px] font-semibold text-foreground sm:max-w-[360px]">
          {title}
        </h1>
        <div className="hidden min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted-foreground sm:flex">
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">aqsha / research thread</span>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 rounded-[7px] text-muted-foreground"
          aria-label="Thread actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
        {showRightTrigger ? <RightSidebarTrigger /> : null}
      </div>
    </header>
  );
}

function RightSidebarTrigger() {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  if (isOpen) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="size-7 rounded-[7px] text-muted-foreground"
      onClick={toggleSidebar}
      aria-label="Toggle research panel"
    >
      <PanelLeftIcon className="size-4 rotate-180" />
    </Button>
  );
}

function ChatThreadState({
  threadId,
  isLoading,
  title,
  recentThreads,
  rateStatus,
  startThread,
  onSend,
  sources,
  runs,
  artifacts,
  onCitationClick,
  onOpenArtifact,
  onCancelRun,
  onRetryRun,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  recentThreads: Array<{
    threadId: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  rateStatus: RateStatus | undefined;
  startThread: (args: {
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  sources: ResearchSource[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  onCitationClick: (citation: number) => void;
  onOpenArtifact: (artifactId: string) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const { isAuthenticated } = useConvexAuth();
  const messages = useUIMessages(
    api.agent.messages.list,
    isAuthenticated && threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );
  const sortedMessages = useMemo(
    () =>
      [...messages.results].sort(
        (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
      ) as unknown as ChatMessage[],
    [messages.results],
  );
  const hasMessages = sortedMessages.length > 0;
  const activeRun = useMemo(() => runs.find(isRunActive), [runs]);
  const interleavedEntries = useMemo(
    () => interleaveRunsWithMessages(sortedMessages, runs),
    [sortedMessages, runs],
  );

  if (!threadId && !hasMessages && runs.length === 0) {
    return (
      <HomeStartState
        recentThreads={recentThreads}
        rateStatus={rateStatus}
        startThread={startThread}
      />
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <ConversationContent className="gap-6 overflow-x-hidden px-5 pb-6 pt-4 sm:px-8 lg:pt-6">
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
                          onRetryRun={onRetryRun}
                        />
                      ) : (
                        <MessageRow
                          message={entry.message}
                          sources={sources}
                          onCitationClick={onCitationClick}
                          onOpenArtifact={onOpenArtifact}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : messages.status === "LoadingFirstPage" && threadId ? (
              <CenteredLoading label="Memuat pesan..." />
            ) : (
              <ConversationEmptyState className="min-h-[48svh]">
                <EmptyThreadCopy title={title} />
              </ConversationEmptyState>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton className="bottom-4 size-8 border-border/70 bg-card/85 text-muted-foreground shadow-none" />
      </Conversation>
      <div className="shrink-0 min-w-0 overflow-x-hidden bg-background/92 px-4 pb-4 pt-2 backdrop-blur sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            threadId={threadId}
            disabled={isLoading}
            rateStatus={rateStatus}
            activeRun={activeRun}
            onCancelRun={onCancelRun}
            onStartThread={startThread}
            onSend={onSend}
          />
        </div>
      </div>
    </div>
  );
}

function HomeStartState({
  recentThreads,
  rateStatus,
  startThread,
}: {
  recentThreads: Array<{
    threadId: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  rateStatus: RateStatus | undefined;
  startThread: (args: {
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
}) {
  const router = useRouter();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-[12svh] sm:px-8 lg:pt-[10svh]">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            disabled={false}
            rateStatus={rateStatus}
            onStartThread={startThread}
            onSend={async () => ({ ok: true, messageId: "" })}
          />
          <HomePromptShortcuts />
          <RecentThreadList
            threads={recentThreads}
            onOpenThread={(threadId) => router.push(`/threads/${threadId}`)}
          />
        </div>
      </div>
    </main>
  );
}

function HomePromptShortcuts() {
  const applySuggestion = (suggestion: string) => {
    window.dispatchEvent(new CustomEvent("aqsha:suggestion", { detail: suggestion }));
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2 px-0.5">
      <button
        type="button"
        onClick={() => applySuggestion("Cari sumber akademik tentang ")}
        className="inline-flex h-9 items-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-4 text-[13px] font-semibold text-[var(--mint)] transition-colors hover:bg-[var(--mint-soft)]/75"
      >
        Cari sumber
      </button>
      <button
        type="button"
        onClick={() => applySuggestion("Buat ringkasan literatur tentang ")}
        className="inline-flex h-9 items-center rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-4 text-[13px] font-semibold text-primary transition-colors hover:bg-[var(--sky-soft)]/75"
      >
        Ringkasan literatur
      </button>
      <button
        type="button"
        onClick={() => applySuggestion("/deep Bandingkan bukti dan celah riset tentang ")}
        className="inline-flex h-9 items-center rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-4 text-[13px] font-semibold text-[var(--lavender)] transition-colors hover:bg-[var(--lavender-soft)]/75"
      >
        Deep research
      </button>
    </div>
  );
}

function RecentThreadList({
  threads,
  onOpenThread,
}: {
  threads: Array<{
    threadId: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
  }>;
  onOpenThread: (threadId: string) => void;
}) {
  if (threads.length === 0) {
    return null;
  }

  return (
    <section className="mt-16 w-full max-w-[520px]" aria-label="Thread terbaru">
      <div className="grid gap-4">
        {threads.map((thread) => (
          <button
            key={thread.threadId}
            type="button"
            onClick={() => onOpenThread(thread.threadId)}
            className="group grid w-full grid-cols-[6.75rem_1fr] items-center gap-3 text-left transition-opacity hover:opacity-90 max-sm:grid-cols-[5.75rem_1fr]"
          >
            <span className="flex h-[72px] flex-col justify-between rounded-[14px] border border-border bg-card px-4 py-3 transition-colors group-hover:border-[var(--lavender-soft-border)]">
              <span className="flex items-center justify-between text-[11px] font-semibold leading-none text-muted-foreground">
                <span>{thread.messageCount || 1}</span>
                <span className="font-mono font-medium text-muted-foreground/75">
                  {formatRelativeThreadTime(thread.lastActivityAt)}
                </span>
              </span>
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-2 py-1 text-[10px] font-semibold leading-none text-[var(--lavender)]">
                <FileTextIcon className="size-3" />
                {threadStatusLabel(thread.status)}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-4 text-foreground">
                {thread.title || "Thread baru"}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
                <FileTextIcon className="size-3 shrink-0 text-[var(--lavender)]" />
                <span className="truncate">
                  {formatNaturalRelativeThreadTime(thread.lastActivityAt)}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function threadStatusLabel(status: "idle" | "streaming" | "failed") {
  if (status === "streaming") return "Aktif";
  if (status === "failed") return "Perlu cek";
  return "Thread";
}

function MessageRow({
  message,
  sources,
  onCitationClick,
  onOpenArtifact,
}: {
  message: ChatMessage;
  sources: ResearchSource[];
  onCitationClick: (citation: number) => void;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const messageSources = useMemo(
    () => getSourcesForMessage(message, text, sources),
    [message, text, sources],
  );
  const messageArtifacts = useQuery(
    api.agent.artifacts.listForMessage,
    !isUser && message.id ? { messageId: message.id } : "skip",
  ) as MessageArtifactLink[] | undefined;

  if (isUser) {
    const promptCommand = message.metadata?.promptCommand;
    const displayText = promptCommand ? stripVisibleCommandText(text, promptCommand) : text;
    return (
      <div className="flex w-full min-w-0 justify-end overflow-x-hidden">
        <div className="max-w-full whitespace-pre-wrap break-words rounded-[14px] border border-border/80 bg-card px-4 py-2.5 text-[13px] leading-[1.55] text-foreground sm:max-w-[560px]">
          {promptCommand ? <PromptCommandChip command={promptCommand} /> : null}
          {displayText}
        </div>
      </div>
    );
  }

  return (
    <Message from="assistant" className="min-w-0 overflow-x-hidden">
      <MessageContent className="w-full min-w-0 overflow-hidden bg-transparent px-0 py-0 text-[13px] leading-[1.55] text-[var(--ink-soft)]">
        <MessageResponse className="aqsha-prose aqsha-prose-message">
          {text}
        </MessageResponse>
        {message.status === "streaming" ? (
          <span className="stream-caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-primary" />
        ) : null}
      </MessageContent>
      {message.status === "streaming" ? (
        <span className="mt-1 inline-flex rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-medium text-primary">
          Sedang menulis
        </span>
      ) : null}
      <MessageSources sources={messageSources} onCitationClick={onCitationClick} />
      <MessageArtifacts
        links={messageArtifacts ?? []}
        onOpenArtifact={onOpenArtifact}
      />
    </Message>
  );
}

type MessageArtifactLink = {
  artifactId: string;
  versionId: string;
  relation: "created" | "updated" | "referenced";
  artifact: ResearchArtifact;
  version: NonNullable<ResearchArtifact["version"]>;
};

function MessageArtifacts({
  links,
  onOpenArtifact,
}: {
  links: MessageArtifactLink[];
  onOpenArtifact: (artifactId: string) => void;
}) {
  const { setOpen, setOpenMobile } = useSidebar();
  if (links.length === 0) return null;

  const handleOpen = (artifactId: string) => {
    onOpenArtifact(artifactId);
    setOpen(true);
    setOpenMobile(true);
  };

  return (
    <div className="mt-3 grid gap-2">
      {links.map((link) => (
        <button
          key={`${link.artifactId}-${link.versionId}`}
          type="button"
          onClick={() => handleOpen(link.artifactId)}
          className="flex max-w-xl items-center gap-3 rounded-[10px] border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-3 py-2 text-left text-[13px] text-[var(--lavender)] transition-colors hover:bg-[var(--lavender-soft)]/75"
        >
          <FileTextIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {link.artifact.title}
            </span>
            <span className="block text-[11px] font-medium opacity-80">
              {link.relation === "updated" ? "Diperbarui" : "Artefak"} · v
              {link.version.versionNumber}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function getSourcesForMessage(
  message: ChatMessage,
  text: string,
  sources: ResearchSource[],
) {
  const directlyLinked = sources.filter(
    (source) => source.messageId === message.id,
  );
  if (directlyLinked.length > 0) {
    return directlyLinked;
  }

  const citedNumbers = extractCitations(text);
  if (citedNumbers.size === 0) {
    return [];
  }

  return sources.filter((source) => citedNumbers.has(source.citationNumber));
}

function MessageSources({
  sources,
  onCitationClick,
}: {
  sources: ResearchSource[];
  onCitationClick: (citation: number) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <Sources className="mt-3 mb-0 text-[var(--mint)]">
      <SourcesTrigger
        count={sources.length}
        className="rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--mint)]"
      >
        {sources.length} sumber terkait
      </SourcesTrigger>
      <SourcesContent className="w-full">
        {sources.slice(0, 5).map((source) => (
          <Source
            key={source._id}
            href={source.url ?? "#"}
            title={source.title}
            className="rounded-[7px] border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-1 text-[11px] text-[var(--mint)]"
            onClick={(event) => {
              onCitationClick(source.citationNumber);
              if (!source.url) event.preventDefault();
            }}
          >
            <span className="font-mono text-[10px]">
              [{source.citationNumber}]
            </span>
            <span className="font-medium">{source.title}</span>
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  );
}

function PromptCommandChip({ command }: { command: PromptCommandMetadata }) {
  return (
    <span
      contentEditable={false}
      className={cn(
        "mr-1.5 inline-flex translate-y-[-1px] items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
        command.mode === "deep"
          ? "border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)]"
          : "border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary",
      )}
    >
      {command.commandSlug}
    </span>
  );
}

function stripVisibleCommandText(text: string, command: PromptCommandMetadata) {
  const trimmed = text.trim();
  if (trimmed === command.commandSlug) {
    return "";
  }
  if (trimmed.startsWith(`${command.commandSlug} `)) {
    return trimmed.slice(command.commandSlug.length).trimStart();
  }
  return text;
}

function Composer({
  threadId,
  disabled,
  rateStatus,
  activeRun,
  onCancelRun,
  onStartThread,
  onSend,
}: {
  threadId?: string;
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onStartThread: (args: {
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
    commandId?: string;
  }) => Promise<SendResult>;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
}) {
  const [content, setContent] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<PromptCommand | null>(null);
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const retryAt = localRetryAt ?? rateStatus?.retryAt ?? null;
  const retrySeconds =
    retryAt && retryAt > now
      ? Math.max(1, Math.ceil((retryAt - now) / 1000))
      : 0;
  const isRateLimited = retrySeconds > 0;
  const visibleContent = createVisibleComposerContent(content, selectedCommand);
  const effectiveMode = selectedCommand?.mode === "deep" ? "deep" : mode;
  const canSend =
    visibleContent.trim().length > 0 &&
    !disabled &&
    !isSending &&
    !isRateLimited;
  const isDeepActive = activeRun?.mode === "deep";
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleSuggestion = (event: Event) => {
      const suggestion = (event as CustomEvent<string>).detail;
      if (typeof suggestion === "string") {
        setSelectedCommand(null);
        setContent(suggestion);
      }
    };
    window.addEventListener("aqsha:suggestion", handleSuggestion);
    return () => window.removeEventListener("aqsha:suggestion", handleSuggestion);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isDeepActive && activeRun && onCancelRun) {
        void onCancelRun(activeRun._id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRun, isDeepActive, onCancelRun]);

  const handleSubmit = async ({ text }: { text: string }) => {
    if (!canSend) {
      return;
    }

    const nextContent = text.trim();
    const nextCommand = selectedCommand;
    setContent("");
    setSelectedCommand(null);
    setIsSending(true);
    try {
      const result = threadId
        ? await onSend({
            threadId,
            content: nextContent,
            mode: effectiveMode,
            commandId: nextCommand?.id,
          })
        : await onStartThread({
            content: nextContent,
            mode: effectiveMode,
            commandId: nextCommand?.id,
          });
      if (!result.ok) {
        setLocalRetryAt(result.retryAt);
        setContent(stripCommandFromSubmittedContent(nextContent, nextCommand));
        setSelectedCommand(nextCommand);
        return;
      }
      if (!threadId && result.threadId) {
        router.push(`/threads/${result.threadId}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PromptInput
      onSubmit={handleSubmit}
      data-aqsha-composer-form="true"
      className="rounded-[14px] border border-input bg-card text-foreground shadow-none transition-colors focus-within:border-ring/70 focus-within:ring-3 focus-within:ring-ring/20 has-disabled:bg-card has-disabled:opacity-100 dark:border-input dark:bg-card dark:text-foreground dark:focus-within:border-ring/65 dark:focus-within:ring-ring/18 dark:has-disabled:bg-card"
    >
      {isRateLimited ? (
        <div className="mx-3 mt-3 rounded-[9px] border border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-2 text-[12px] font-medium text-[var(--lemon)]">
          Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
        </div>
      ) : null}
      <TokenizedPromptInput
        value={content}
        command={selectedCommand}
        onValueChange={setContent}
        onCommandChange={(command) => {
          setSelectedCommand(command);
          if (command?.mode === "deep") {
            setMode("deep");
          }
        }}
        onSubmit={() => {
          if (canSend) {
            document
              .querySelector<HTMLFormElement>("[data-aqsha-composer-form='true']")
              ?.requestSubmit();
          }
        }}
        disabled={disabled || isDeepActive}
        maxLength={8000}
        placeholder={
          threadId
            ? "Tulis follow up, atau ketik / untuk perintah riset..."
            : "Tulis pertanyaan, atau ketik / untuk perintah riset..."
        }
      />
      <input type="hidden" name="message" value={visibleContent} />
      <PromptInputFooter className="flex w-full items-end justify-between gap-3 border-t-0 px-4 pb-4 pt-1 text-[var(--ink-soft)] dark:text-[#d4d4d4]">
        <PromptInputTools className="min-w-0 flex-wrap gap-2">
          <div className="inline-flex rounded-full border border-border bg-muted p-0.5 text-[13px] font-semibold text-[var(--ink-soft)] dark:border-input dark:bg-muted dark:text-[#d4d4d4]">
            <ModeButton
              active={mode === "normal"}
              onClick={() => setMode("normal")}
              disabled={isDeepActive}
              variant="normal"
            >
              Normal
            </ModeButton>
            <ModeButton
              active={mode === "deep"}
              onClick={() => setMode("deep")}
              disabled={isDeepActive}
              variant="deep"
            >
              Deep
            </ModeButton>
          </div>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              tooltip="Tambah konteks"
              disabled={mode === "deep" || !threadId || disabled || isDeepActive}
              className="size-9 rounded-[9px] text-[var(--ink-soft)] hover:bg-muted hover:text-foreground disabled:text-muted-foreground disabled:opacity-75 dark:text-[#d4d4d4] dark:hover:bg-muted dark:hover:text-foreground dark:disabled:text-[#a3a3a3] dark:disabled:opacity-85"
            >
              <PlusIcon className="size-4" />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent>
              <PromptInputActionMenuItem disabled>
                <PaperclipIcon className="mr-2 size-4" />
                Lampirkan sumber
              </PromptInputActionMenuItem>
              <PromptInputActionMenuItem disabled>
                <PlusIcon className="mr-2 size-4" />
                Tambah konteks thread
              </PromptInputActionMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputButton
            tooltip="Lampirkan"
            className="size-9 rounded-[9px] text-[var(--ink-soft)] hover:bg-muted hover:text-foreground disabled:text-muted-foreground disabled:opacity-75 dark:text-[#d4d4d4] dark:hover:bg-muted dark:hover:text-foreground dark:disabled:text-[#a3a3a3] dark:disabled:opacity-85"
            disabled
          >
            <PaperclipIcon className="size-4" />
          </PromptInputButton>
        </PromptInputTools>
        {isDeepActive && activeRun && onCancelRun ? (
          <PromptInputSubmit
            status="streaming"
            onStop={() => onCancelRun(activeRun._id)}
            size="sm"
            className="h-10 shrink-0 rounded-[10px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-3.5 font-semibold text-[var(--coral)] hover:bg-[var(--coral-soft)]"
          >
            <SquareIcon className="size-3.5" />
            Hentikan
          </PromptInputSubmit>
        ) : (
          <PromptInputSubmit
            size="icon-sm"
            className="size-10 shrink-0 rounded-[12px] bg-primary text-primary-foreground shadow-none transition-colors hover:bg-[#2f73d6] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-[#0b7cff] dark:text-white dark:hover:bg-[#2f8cff] dark:disabled:bg-muted dark:disabled:text-[#a3a3a3]"
            disabled={!canSend}
            status={isSending ? "submitted" : undefined}
          >
            {isSending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowUpIcon className="size-4" />
            )}
          </PromptInputSubmit>
        )}
      </PromptInputFooter>
    </PromptInput>
  );
}

function TokenizedPromptInput({
  value,
  command,
  onValueChange,
  onCommandChange,
  onSubmit,
  disabled,
  maxLength,
  placeholder,
}: {
  value: string;
  command: PromptCommand | null;
  onValueChange: (value: string) => void;
  onCommandChange: (command: PromptCommand | null) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
  placeholder: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const isArgumentEmpty = value.length === 0;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const shouldSyncWhileFocused = value.length === 0;
    if (
      editor.innerText !== value &&
      (document.activeElement !== editor || shouldSyncWhileFocused)
    ) {
      editor.innerText = value;
    }
  }, [value]);

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      moveCaretToEnd(editor);
    });
  }, []);

  const handleSelectCommand = useCallback(
    (selected: PromptCommand) => {
      onCommandChange(selected);
      setCommandOpen(false);
      focusEditor();
    },
    [focusEditor, onCommandChange],
  );

  const clearCommand = useCallback(() => {
    onCommandChange(null);
    focusEditor();
  }, [focusEditor, onCommandChange]);

  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const text = editor.innerText.replace(/\u00a0/g, " ");
    if (text.length <= maxLength) {
      onValueChange(text);
      return;
    }
    const trimmed = text.slice(0, maxLength);
    editor.innerText = trimmed;
    moveCaretToEnd(editor);
    onValueChange(trimmed);
  }, [maxLength, onValueChange]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key === "/" && !command && isSlashCommandPosition(editorRef.current)) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        command &&
        isArgumentEmpty
      ) {
        event.preventDefault();
        clearCommand();
        return;
      }
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setCommandOpen(false);
        focusEditor();
      }
    },
    [clearCommand, command, commandOpen, focusEditor, isArgumentEmpty, onSubmit],
  );

  return (
    <Popover open={commandOpen} onOpenChange={setCommandOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-h-16 w-full items-start gap-2 px-4 pb-3 pt-4 text-[15px] font-medium leading-6 text-foreground",
            disabled && "opacity-100",
          )}
          onKeyDownCapture={(event) => {
            if (
              (event.key === "Backspace" || event.key === "Delete") &&
              command &&
              isArgumentEmpty
            ) {
              event.preventDefault();
              event.stopPropagation();
              clearCommand();
            }
          }}
        >
          {command ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearCommand}
              className={cn(
                "mt-0.5 shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold leading-none",
                command.mode === "deep"
                  ? "border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)]"
                  : "border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary",
              )}
            >
              {command.slug}
            </button>
          ) : null}
          <div className="relative min-w-0 flex-1">
            {value.length === 0 ? (
              <span className="pointer-events-none absolute left-0 top-0 font-medium text-muted-foreground dark:text-[#b8b8b8]">
                {command?.placeholder ?? placeholder}
              </span>
            ) : null}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              role="textbox"
              aria-label="Pesan"
              aria-multiline="true"
              data-slot="input-group-control"
              className="min-h-10 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-foreground caret-primary outline-none disabled:opacity-100"
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              suppressContentEditableWarning
            />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusEditor();
        }}
      >
        <Command
          key={commandOpen ? "open" : "closed"}
          shouldFilter={false}
          className="rounded-lg p-0"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setCommandOpen(false);
              focusEditor();
            }
          }}
        >
          <CommandList className="max-h-[17rem] py-1">
            {promptCommandGroups.map((group) => (
              <CommandGroup
                key={group}
                heading={group}
                className="border-b border-border/70 p-1 last:border-b-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-0 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:leading-3"
              >
                {promptCommands
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelectCommand(item)}
                      className="min-h-10 items-start gap-2 rounded-md px-2 py-1.5 text-[13px]"
                    >
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate font-medium leading-4">
                          {item.slug}
                        </span>
                        <span className="block whitespace-normal text-[10px] leading-3 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      {item.mode === "deep" ? (
                        <span className="shrink-0 rounded-full bg-[var(--lavender-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--lavender)]">
                          Deep
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const promptCommandGroups = [
  "Tulis Akademik",
  "Rancang Riset",
  "Riset Mendalam",
] as const;

function createVisibleComposerContent(content: string, command: PromptCommand | null) {
  const trimmed = content.trim();
  if (!command) {
    return content;
  }
  return trimmed.length > 0 ? `${command.slug} ${trimmed}` : command.slug;
}

function stripCommandFromSubmittedContent(
  content: string,
  command: PromptCommand | null,
) {
  return command ? stripCommandFromContent(content, command) : content;
}

function isSlashCommandPosition(editor: HTMLDivElement | null) {
  if (!editor) {
    return false;
  }
  const beforeCursor = getTextBeforeCursor(editor);
  return beforeCursor.length === 0 || /\s$/.test(beforeCursor);
}

function getTextBeforeCursor(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return editor.innerText;
  }
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) {
    return editor.innerText;
  }
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(editor);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  return beforeRange.toString();
}

function moveCaretToEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ModeButton({
  active,
  onClick,
  disabled,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant: "normal" | "deep";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 transition-colors disabled:opacity-75 dark:disabled:opacity-80",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgb(26_31_43_/_0.08)]"
          : "text-[var(--ink-soft)] hover:text-foreground dark:text-[#cfcfcf] dark:hover:text-foreground",
        active && variant === "deep" && "text-[var(--lavender)]",
        active && variant === "normal" && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AgentRunBlock({
  run,
  artifacts,
  onRetryRun,
}: {
  run: ResearchRun;
  artifacts: ResearchArtifact[];
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const sortedSteps = run.steps.slice().sort((a, b) => a.order - b.order);
  const activeStep = sortedSteps.find((step) => step.status === "running");
  const isActive = isRunActive(run);
  const isDeep = run.mode === "deep";
  const [open, setOpen] = useState(isDeep);
  const accentClass = isDeep ? "text-[var(--lavender)]" : "text-primary";

  const durationLabel = formatRunDuration(run, activeStep);
  const summaryText = activeStep
    ? `Sedang mengerjakan · ${activeStep.label.toLowerCase()}`
    : run.status === "completed"
      ? `Selesai · ${durationLabel}`
      : run.status === "failed"
        ? "Berhenti sebelum selesai"
        : run.status === "canceled"
          ? "Dihentikan"
          : `Berjalan · ${durationLabel}`;

  return (
    <div className="w-full text-[13px] text-muted-foreground">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground"
        >
          {isActive ? (
            <Shimmer className="font-medium">{summaryText}</Shimmer>
          ) : (
            <span className={cn("font-medium", accentClass)}>{summaryText}</span>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
      </div>
      {open ? (
        <ol className="mt-2 grid gap-1.5 pl-0">
          {sortedSteps.map((step) => (
            <AgentRunStep
              key={step.stepKey}
              step={step}
              events={(run.events ?? []).filter(
                (event) => eventStepKey(event) === step.stepKey,
              )}
              artifacts={artifacts}
              runActiveArtifactId={run.activeArtifactId}
              accentClass={accentClass}
            />
          ))}
        </ol>
      ) : null}
      {run.status === "failed" && run.retryable ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--coral)]">
          <span className="flex-1">
            {run.errorMessage ?? "Riset terhenti sebelum selesai."}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[12px] text-[var(--coral)] hover:text-[var(--coral)]"
            onClick={() => onRetryRun(run._id)}
          >
            <RotateCcwIcon className="size-3.5" />
            Coba lagi
          </Button>
        </div>
      ) : null}
      {run.status === "canceled" ? (
        <p className="mt-3 text-[13px] font-medium text-muted-foreground">
          Dihentikan
        </p>
      ) : null}
    </div>
  );
}

function AgentRunStep({
  step,
  events,
  artifacts,
  runActiveArtifactId,
  accentClass,
}: {
  step: ResearchRun["steps"][number];
  events: ResearchRun["events"];
  artifacts: ResearchArtifact[];
  runActiveArtifactId?: string;
  accentClass: string;
}) {
  const expandable =
    Boolean(step.summary) || events.length > 0 || (step.artifactCount ?? 0) > 0;
  const [expanded, setExpanded] = useState(false);

  const descriptor = [
    step.sourceCount ? `${step.sourceCount} sumber` : null,
    step.artifactCount ? `${step.artifactCount} artefak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const toneClass =
    step.status === "running"
      ? "text-foreground"
      : step.status === "completed"
        ? "text-[var(--ink-soft)]"
        : step.status === "failed" || step.status === "canceled"
          ? "text-[var(--coral)]"
          : "text-muted-foreground/80";

  const artifact = runActiveArtifactId
    ? artifacts.find((item) => item._id === runActiveArtifactId)
    : undefined;

  const toggle = () => {
    if (!expandable) return;
    setExpanded((value) => !value);
  };

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expandable ? expanded : undefined}
        disabled={!expandable}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 text-left text-[13px] leading-5",
          toneClass,
          expandable ? "hover:text-foreground" : "cursor-default",
        )}
      >
        <span className="min-w-0">
          {step.status === "running" ? (
            <Shimmer>{step.label}</Shimmer>
          ) : (
            step.label
          )}
          {descriptor ? (
            <span className="ml-2 text-muted-foreground">· {descriptor}</span>
          ) : null}
          {step.status === "failed" && step.failureReason ? (
            <span className="ml-2 text-[var(--coral)]">
              · {step.failureReason}
            </span>
          ) : null}
        </span>
        {expandable ? (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        ) : null}
      </button>
      {expandable && expanded ? (
        <div className="mt-1.5 grid gap-2 text-[12px] leading-5 text-muted-foreground">
          {step.summary ? <p>{step.summary}</p> : null}
          {events.length > 0 ? (
            <div className="grid gap-1 border-l border-border/70 pl-3">
              {events.map((event) => (
                <div key={event._id} className="min-w-0">
                  <div className={cn("font-medium", accentClass)}>
                    {event.title}
                  </div>
                  <div className="break-words text-muted-foreground">
                    {event.summary}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {(step.artifactCount ?? 0) > 0 ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-[8px] bg-muted/45 px-2.5 py-1.5 text-[12px] text-foreground">
              <FileTextIcon className="size-3.5 text-[var(--lavender)]" />
              <span className="font-medium">
                {artifact?.title ?? "Artefak riset"}
              </span>
              <span className="text-[var(--mint)]">
                +{step.artifactCount}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function eventStepKey(event: ResearchRun["events"][number]) {
  if (event.stepKey) {
    return event.stepKey;
  }
  switch (event.eventType) {
    case "plan":
      return "planResearch";
    case "query":
    case "search":
    case "gap":
      return "retrieveSources";
    case "read":
    case "rerank":
      return "readExtract";
    case "audit":
      return "verifyCitations";
    case "artifact":
      return "persistArtifact";
    case "status":
      return "finalizeThread";
    case "failure":
    case "tool":
    default:
      return undefined;
  }
}

function formatRunDuration(
  run: ResearchRun,
  activeStep: ResearchRun["steps"][number] | undefined,
) {
  const start = run.createdAt;
  const end =
    run.completedAt ??
    run.canceledAt ??
    (activeStep ? Date.now() : run.completedAt) ??
    Date.now();
  if (!start) return "beberapa saat";
  const ms = Math.max(0, end - start);
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatRelativeThreadTime(timestamp: number) {
  const label = formatDistanceToNowStrict(new Date(timestamp), {
    locale: idLocale,
  });

  return label
    .replace(" detik", "d")
    .replace(" menit", "m")
    .replace(" jam", "j")
    .replace(" hari", "h")
    .replace(" bulan", "bln")
    .replace(" tahun", "thn");
}

function formatNaturalRelativeThreadTime(timestamp: number) {
  const now = Date.now();
  const distance = Math.max(0, now - timestamp);
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (distance >= thirtyDays) {
    return format(new Date(timestamp), "d MMM yyyy", { locale: idLocale });
  }

  return formatDistanceToNowStrict(new Date(timestamp), {
    locale: idLocale,
    addSuffix: true,
  });
}

function isRunActive(run: ResearchRun) {
  return (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "waiting"
  );
}

type InterleavedEntry =
  | { kind: "message"; message: ChatMessage }
  | { kind: "run"; run: ResearchRun };

function interleavedEntryKey(entry: InterleavedEntry) {
  return entry.kind === "run"
    ? `run:${entry.run._id}`
    : `message:${entry.message.key ?? entry.message.id}`;
}

function entryGapClass(
  previous: InterleavedEntry | undefined,
  current: InterleavedEntry,
) {
  if (previous?.kind === "run" && current.kind === "message") {
    if (previous.run.status === "completed" && current.message.role === "assistant") {
      return "mt-1";
    }
    return "mt-5";
  }
  return "mt-7";
}

function interleaveRunsWithMessages(
  messages: ChatMessage[],
  runs: ResearchRun[],
): InterleavedEntry[] {
  if (runs.length === 0) {
    return messages.map((message) => ({ kind: "message", message }));
  }

  const usedRunIds = new Set<string>();
  const runsByPrompt = new Map<string, ResearchRun[]>();
  for (const run of runs) {
    if (!run.promptMessageId) continue;
    const bucket = runsByPrompt.get(run.promptMessageId) ?? [];
    bucket.push(run);
    runsByPrompt.set(run.promptMessageId, bucket);
  }

  const entries: InterleavedEntry[] = [];
  let pendingRuns: ResearchRun[] = [];

  for (const message of messages) {
    if (message.role !== "user" && pendingRuns.length > 0) {
      for (const run of pendingRuns) {
        entries.push({ kind: "run", run });
      }
      pendingRuns = [];
    }

    entries.push({ kind: "message", message });

    if (message.role === "user") {
      const bucket = runsByPrompt.get(message.id) ?? [];
      for (const run of bucket) {
        usedRunIds.add(run._id);
        pendingRuns.push(run);
      }
    }
  }

  for (const run of pendingRuns) {
    entries.push({ kind: "run", run });
  }

  for (const run of runs) {
    if (!usedRunIds.has(run._id)) {
      entries.push({ kind: "run", run });
    }
  }

  return entries;
}

function extractCitations(text: string) {
  return new Set(
    [...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])),
  );
}

function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center py-12">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function EmptyThreadCopy({ title }: { title?: string }) {
  const applySuggestion = (suggestion: string) => {
    window.dispatchEvent(new CustomEvent("aqsha:suggestion", { detail: suggestion }));
  };

  return (
    <div className="grid flex-1 place-items-center py-16 text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-[var(--lavender)]">
          quiet desk, clear sources
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-[28px] font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
        <Suggestions className="mx-auto max-w-full justify-center">
          <Suggestion
            suggestion="Cari sumber tentang dampak AI pada pembelajaran mandiri."
            onClick={applySuggestion}
            className="border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)] hover:bg-[var(--mint-soft)]"
          >
            Cari sumber tentang...
          </Suggestion>
          <Suggestion
            suggestion="Buat ringkasan literatur tentang retrieval augmented generation untuk pendidikan."
            onClick={applySuggestion}
            className="border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary hover:bg-[var(--sky-soft)]"
          >
            Buat ringkasan literatur...
          </Suggestion>
          <Suggestion
            suggestion="Bandingkan dua teori belajar konstruktivisme dan connectivism dengan sumber akademik."
            onClick={applySuggestion}
            className="border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)] hover:bg-[var(--lavender-soft)]"
          >
            Bandingkan dua teori...
          </Suggestion>
        </Suggestions>
      </div>
    </div>
  );
}

function AccessDeniedState() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">
            Thread tidak tersedia.
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Thread ini tidak ditemukan untuk akun yang sedang masuk.
          </p>
        </div>
      </div>
      <div className="border-t bg-background/85 px-4 py-4 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <Composer
            disabled
            rateStatus={undefined}
            onStartThread={async () => ({ ok: true, messageId: "" })}
            onSend={async () => ({ ok: true, messageId: "" })}
          />
        </div>
      </div>
    </div>
  );
}

function getMessageText(message: ChatMessage) {
  const partText = message.parts
    ?.map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("");
  return partText || message.text || "";
}
