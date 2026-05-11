"use client";

import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import {
  BotIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SquareIcon,
  UserIcon,
  XCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@aqsha/convex/api";
import { AppSidebar } from "@/components/app-sidebar";
import { SourcesPanel, type ResearchSource } from "@/components/sources-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type SendResult =
  | { ok: true; messageId: string; runId?: string; workflowId?: string }
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
};

type ResearchRun = {
  _id: string;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "canceled";
  currentStep?: string;
  activeArtifactId?: string;
  retryable: boolean;
  errorMessage?: string;
  steps: Array<{
    stepKey: string;
    label: string;
    order: number;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    summary?: string;
    sourceCount?: number;
    artifactCount?: number;
    failureReason?: string;
  }>;
};

type ResearchArtifact = {
  _id: string;
  runId: string;
  type:
    | "markdown_report"
    | "research_document"
    | "source_bundle"
    | "citation_evidence_view";
  title: string;
  markdown?: string;
  createdAt: number;
};

type CitationCheck = {
  _id: string;
  claim: string;
  support: "supported" | "partial" | "unsupported";
  sourceIds: string[];
  evidence: string;
};

export function ThreadShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const viewer = useQuery(api.auth.getCurrentUser);
  const threadPage = useQuery(api.agent.threads.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const selectedThread = useQuery(
    api.agent.threads.get,
    threadId ? { threadId } : "skip",
  );
  const createThread = useMutation(api.agent.threads.create);
  const sendMessage = useMutation(api.agent.messages.send).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.agent.messages.list)(store, {
        threadId: args.threadId,
        prompt: args.content,
      });
    },
  );
  const rateStatus = useQuery(api.agent.rateLimits.getSendStatus);
  const sources = useQuery(
    api.agent.sources.list,
    threadId ? { threadId } : "skip",
  );
  const runs = useQuery(
    api.agent.deepResearch.listForThread,
    threadId ? { threadId } : "skip",
  ) as ResearchRun[] | undefined;
  const artifacts = useQuery(
    api.agent.deepResearch.listArtifacts,
    threadId ? { threadId } : "skip",
  ) as ResearchArtifact[] | undefined;
  const cancelRun = useMutation(api.agent.deepResearch.cancel);
  const retryRun = useMutation(api.agent.deepResearch.retry);
  const [isCreating, setIsCreating] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [showMobileSources, setShowMobileSources] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const activeArtifact = useQuery(
    api.agent.deepResearch.getArtifact,
    activeArtifactId ? { artifactId: activeArtifactId as never } : "skip",
  ) as ResearchArtifact | null | undefined;
  const citationChecks = useQuery(
    api.agent.deepResearch.listCitationChecks,
    activeArtifactId ? { artifactId: activeArtifactId as never } : "skip",
  ) as CitationCheck[] | undefined;

  const threads = threadPage?.page ?? [];
  const title = threadId
    ? selectedThread?.title ?? "Thread tidak ditemukan"
    : "Thread baru";

  const handleCreateThread = async () => {
    setIsCreating(true);
    try {
      const result = await createThread({});
      router.push(`/thread/${result.threadId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar
        viewer={viewer}
        threads={threads}
        selectedThreadId={threadId}
        isCreating={isCreating}
        onCreateThread={handleCreateThread}
      />
      <SidebarInset className="bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card/80 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[48vw] truncate font-medium sm:max-w-[520px]">
                    {title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex min-h-[calc(100svh-4rem)] min-w-0">
          <section className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-8">
            {threadId && selectedThread === null ? (
              <AccessDeniedState />
            ) : (
              <ChatThreadState
                threadId={threadId}
                isLoading={threadId ? selectedThread === undefined : false}
                title={threadId ? selectedThread?.title : undefined}
                rateStatus={rateStatus}
                onSend={sendMessage}
                sources={sources ?? []}
                runs={runs ?? []}
                activeArtifact={activeArtifact ?? null}
                citationChecks={citationChecks ?? []}
                onCitationClick={(citation) => {
                  setActiveCitation(citation);
                  setShowMobileSources(true);
                }}
                onCancelRun={(runId) => cancelRun({ runId: runId as never })}
                onRetryRun={(runId) => retryRun({ runId: runId as never })}
              />
            )}
          </section>
          {(sources && sources.length > 0) ||
          (artifacts && artifacts.length > 0) ||
          runs?.some((run) => isRunActive(run)) ? (
            <>
              <div className="hidden lg:block">
                <SourcesPanel
                  sources={sources ?? []}
                  artifacts={artifacts ?? []}
                  activeArtifactId={activeArtifactId}
                  activeCitation={activeCitation}
                  onOpenArtifact={setActiveArtifactId}
                />
              </div>
              {showMobileSources ? (
                <SourcesPanel
                  sources={sources ?? []}
                  artifacts={artifacts ?? []}
                  activeArtifactId={activeArtifactId}
                  activeCitation={activeCitation}
                  onOpenArtifact={setActiveArtifactId}
                  onClose={() => setShowMobileSources(false)}
                />
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="fixed bottom-24 right-4 z-30 rounded-full lg:hidden"
                  onClick={() => setShowMobileSources(true)}
                  aria-label="Open sources"
                >
                  <PanelRightCloseIcon className="size-4" />
                </Button>
              )}
            </>
          ) : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ChatThreadState({
  threadId,
  isLoading,
  title,
  rateStatus,
  onSend,
  sources,
  runs,
  activeArtifact,
  citationChecks,
  onCitationClick,
  onCancelRun,
  onRetryRun,
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
  }) => Promise<SendResult>;
  sources: ResearchSource[];
  runs: ResearchRun[];
  activeArtifact: ResearchArtifact | null;
  citationChecks: CitationCheck[];
  onCitationClick: (citation: number) => void;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  const messages = useUIMessages(
    api.agent.messages.list,
    threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );
  const sortedMessages = useMemo(
    () =>
      [...messages.results].sort(
        (a, b) => a.order - b.order || a.stepOrder - b.stepOrder,
      ),
    [messages.results],
  );
  const hasMessages = sortedMessages.length > 0;
  const activeRun = runs.find(isRunActive);

  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-6">
        {activeArtifact ? (
          <ArtifactReader
            artifact={activeArtifact}
            citationChecks={citationChecks}
            onCitationClick={onCitationClick}
          />
        ) : isLoading ? (
          <CenteredLoading label="Loading thread..." />
        ) : hasMessages ? (
          <div className="grid gap-7">
            {sortedMessages.map((message) => (
              <MessageRow
                key={message.key ?? message.id}
                message={message}
                sources={sources}
                onCitationClick={onCitationClick}
              />
            ))}
            {runs.map((run) => (
              <DeepRunBlock
                key={run._id}
                run={run}
                onCancelRun={onCancelRun}
                onRetryRun={onRetryRun}
              />
            ))}
          </div>
        ) : messages.status === "LoadingFirstPage" && threadId ? (
          <CenteredLoading label="Memuat pesan..." />
        ) : (
          <EmptyThreadCopy title={title} />
        )}
      </div>
      <Composer
        threadId={threadId}
        disabled={!threadId || isLoading}
        rateStatus={rateStatus}
        activeRun={activeRun}
        onCancelRun={onCancelRun}
        onSend={onSend}
      />
    </div>
  );
}

function MessageRow({
  message,
  sources,
  onCitationClick,
}: {
  message: ChatMessage;
  sources: ResearchSource[];
  onCitationClick: (citation: number) => void;
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const citedNumbers = new Set(sources.map((source) => source.citationNumber));

  return (
    <article className="grid grid-cols-[32px_1fr] gap-3">
      <div className="flex size-8 items-center justify-center rounded-full border bg-card text-primary">
        {isUser ? <UserIcon className="size-4" /> : <BotIcon className="size-4" />}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold">
            {isUser ? "You" : "Astra"}
          </span>
          {message.status === "streaming" ? (
            <span className="rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-2 py-0.5 text-[11px] font-semibold text-primary">
              Streaming
            </span>
          ) : null}
        </div>
        <div className="break-words text-[15px] leading-7 text-[var(--ink-soft)]">
          {isUser ? (
            <div className="whitespace-pre-wrap">{text}</div>
          ) : (
            <AssistantMarkdown
              text={text}
              citedNumbers={citedNumbers}
              onCitationClick={onCitationClick}
            />
          )}
          {message.status === "streaming" ? (
            <span className="stream-caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-primary" />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AssistantMarkdown({
  text,
  citedNumbers,
  onCitationClick,
}: {
  text: string;
  citedNumbers: Set<number>;
  onCitationClick: (citation: number) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
            {children}
          </code>
        ),
        text: ({ children }) => (
          <>
            {String(children)
              .split(/(\[\d{1,3}\])/g)
              .map((part, index) => {
                const match = part.match(/^\[(\d{1,3})\]$/);
                if (!match) {
                  return part;
                }
                const citation = Number(match[1]);
                return (
                  <button
                    key={`${part}-${index}`}
                    type="button"
                    className="mx-0.5 inline-flex min-w-6 items-center justify-center rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-1.5 py-0.5 align-baseline font-mono text-[11px] font-semibold text-[var(--mint)] hover:border-[var(--mint)] disabled:opacity-60"
                    disabled={!citedNumbers.has(citation)}
                    onClick={() => onCitationClick(citation)}
                  >
                    {citation}
                  </button>
                );
              })}
          </>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function Composer({
  threadId,
  disabled,
  rateStatus,
  activeRun,
  onCancelRun,
  onSend,
}: {
  threadId?: string;
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal" | "deep";
  }) => Promise<SendResult>;
  activeRun?: ResearchRun;
  onCancelRun?: (runId: string) => Promise<unknown>;
}) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"normal" | "deep">("normal");
  const [isSending, setIsSending] = useState(false);
  const [localRetryAt, setLocalRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const retryAt = localRetryAt ?? rateStatus?.retryAt ?? null;
  const retrySeconds =
    retryAt && retryAt > now ? Math.max(1, Math.ceil((retryAt - now) / 1000)) : 0;
  const isRateLimited = retrySeconds > 0;
  const canSend =
    !!threadId &&
    content.trim().length > 0 &&
    !disabled &&
    !isSending &&
    !isRateLimited;
  const isDeepActive = Boolean(activeRun);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!threadId || !canSend) {
      return;
    }

    const nextContent = content.trim();
    setContent("");
    setIsSending(true);
    try {
      const result = await onSend({
        threadId,
        content: nextContent,
        mode,
      });
      if (!result.ok) {
        setLocalRetryAt(result.retryAt);
        setContent(nextContent);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-4 rounded-[14px] border bg-card p-3 shadow-aqsha"
    >
      {isRateLimited ? (
        <div className="mb-3 rounded-[10px] border border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] px-3 py-2 text-sm font-medium text-[var(--lemon)]">
          Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
        </div>
      ) : null}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={disabled || isDeepActive}
        rows={3}
        maxLength={8000}
        placeholder={
          threadId ? "Tulis pertanyaan riset..." : "Buat thread baru dulu..."
        }
        className="min-h-24 w-full resize-none rounded-[10px] border border-input bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] p-1 text-xs font-semibold">
          <button
            type="button"
            disabled={isDeepActive}
            onClick={() => setMode("normal")}
            className={mode === "normal" ? "rounded-full bg-card px-3 py-1 text-foreground shadow-sm" : "px-3 py-1 text-[var(--lavender)]"}
          >
            Normal
          </button>
          <button
            type="button"
            disabled={isDeepActive}
            onClick={() => setMode("deep")}
            className={mode === "deep" ? "rounded-full bg-card px-3 py-1 text-foreground shadow-sm" : "px-3 py-1 text-[var(--lavender)]"}
          >
            Deep
          </button>
        </div>
        {isDeepActive && activeRun && onCancelRun ? (
          <Button
            type="button"
            variant="outline"
            className="border-[var(--coral-soft-border)] bg-[var(--coral-soft)] text-[var(--coral)] hover:bg-[var(--coral-soft)]"
            onClick={() => onCancelRun(activeRun._id)}
          >
            <SquareIcon className="size-4" />
            Hentikan
          </Button>
        ) : (
        <Button type="submit" disabled={!canSend}>
          {isSending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SendHorizontalIcon className="size-4" />
          )}
          Send
        </Button>
        )}
      </div>
    </form>
  );
}

function DeepRunBlock({
  run,
  onCancelRun,
  onRetryRun,
}: {
  run: ResearchRun;
  onCancelRun: (runId: string) => Promise<unknown>;
  onRetryRun: (runId: string) => Promise<unknown>;
}) {
  return (
    <article className="grid grid-cols-[32px_1fr] gap-3">
      <div className="flex size-8 items-center justify-center rounded-full border bg-card text-primary">
        <BotIcon className="size-4" />
      </div>
      <div className="rounded-[10px] border bg-card/80 p-3 shadow-soft-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Astra</span>
          {isRunActive(run) ? (
            <Button variant="ghost" size="sm" onClick={() => onCancelRun(run._id)}>
              Hentikan
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2">
          {run.steps
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((step) => (
              <div key={step.stepKey} className="flex items-center gap-2 rounded-[8px] border bg-background/70 px-3 py-2 text-sm">
                <StepIcon status={step.status} />
                <span className={step.status === "running" ? "shimmer-text font-semibold" : "font-medium"}>
                  {step.label}
                </span>
                {step.sourceCount ? (
                  <span className="ml-auto rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {step.sourceCount} sources
                  </span>
                ) : null}
              </div>
            ))}
        </div>
        {run.status === "failed" && run.retryable ? (
          <div className="mt-3 rounded-[10px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] p-3 text-sm text-[var(--coral)]">
            <p>{run.errorMessage ?? "Riset terhenti sebelum selesai."}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => onRetryRun(run._id)}>
              <RotateCcwIcon className="size-3.5" />
              Coba lagi
            </Button>
          </div>
        ) : null}
        {run.status === "canceled" ? (
          <p className="mt-3 text-sm font-medium text-muted-foreground">Dihentikan</p>
        ) : null}
      </div>
    </article>
  );
}

function StepIcon({ status }: { status: ResearchRun["steps"][number]["status"] }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-4 text-[var(--mint)]" />;
  }
  if (status === "failed" || status === "canceled") {
    return <XCircleIcon className="size-4 text-[var(--coral)]" />;
  }
  if (status === "running") {
    return <Loader2Icon className="size-4 animate-spin text-primary" />;
  }
  return <span className="size-2 rounded-full bg-muted-foreground/40" />;
}

function ArtifactReader({
  artifact,
  citationChecks,
  onCitationClick,
}: {
  artifact: ResearchArtifact;
  citationChecks: CitationCheck[];
  onCitationClick: (citation: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = artifact.markdown ?? "Artefak ini disimpan di storage.";
  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?artifact=${artifact._id}`);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon className="size-4 text-[var(--lavender)]" />
          <h2 className="truncate font-heading text-xl font-bold">{artifact.title}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyMarkdown}>
            <CopyIcon className="size-3.5" />
            {copied ? "Tersalin" : "Salin markdown"}
          </Button>
          <Button variant="outline" size="sm" onClick={copyLink}>
            Bagikan link
          </Button>
        </div>
      </div>
      {artifact.type === "citation_evidence_view" && citationChecks.length > 0 ? (
        <div className="grid gap-3">
          {citationChecks.map((check) => (
            <div key={check._id} className="rounded-[8px] border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                  {check.support}
                </span>
              </div>
              <p className="text-sm leading-6">{check.claim}</p>
              <p className="mt-2 text-xs text-muted-foreground">{check.evidence}</p>
            </div>
          ))}
        </div>
      ) : (
        <AssistantMarkdown
          text={markdown}
          citedNumbers={extractCitations(markdown)}
          onCitationClick={onCitationClick}
        />
      )}
    </div>
  );
}

function isRunActive(run: ResearchRun) {
  return run.status === "queued" || run.status === "running" || run.status === "waiting";
}

function extractCitations(text: string) {
  return new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])));
}

function CenteredLoading({ label }: { label: string }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}

function EmptyThreadCopy({ title }: { title?: string }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div className="grid gap-5">
        <p className="font-hand text-2xl text-[var(--lavender)]">
          quiet desk, clear sources
        </p>
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight sm:text-[32px]">
            {title ?? "Mulai riset dari satu pertanyaan."}
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-7 text-muted-foreground">
            Tempat tenang untuk menyusun pertanyaan, membaca kembali konteks,
            dan menjaga riset tetap rapi.
          </p>
        </div>
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
      <Composer
        disabled
        rateStatus={undefined}
        onSend={async () => ({ ok: true, messageId: "" })}
      />
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
