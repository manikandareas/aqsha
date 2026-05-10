"use client";

import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react";
import { useMutation, useQuery } from "convex/react";
import {
  BotIcon,
  Loader2Icon,
  SendHorizontalIcon,
  UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@aqsha/convex/api";
import { AppSidebar } from "@/components/app-sidebar";
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
  | { ok: true; messageId: string }
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

export function ThreadShell({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const viewer = useQuery(api.auth.getCurrentUser);
  const threadPage = useQuery(api.threads.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const selectedThread = useQuery(
    api.threads.get,
    threadId ? { threadId } : "skip",
  );
  const createThread = useMutation(api.threads.create);
  const sendMessage = useMutation(api.messages.send).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.messages.list)(store, {
        threadId: args.threadId,
        prompt: args.content,
      });
    },
  );
  const rateStatus = useQuery(api.rateLimits.getSendStatus);
  const [isCreating, setIsCreating] = useState(false);

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

        <main className="flex min-h-[calc(100svh-4rem)] flex-col">
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-8 sm:px-8">
            {threadId && selectedThread === null ? (
              <AccessDeniedState />
            ) : (
              <ChatThreadState
                threadId={threadId}
                isLoading={threadId ? selectedThread === undefined : false}
                title={threadId ? selectedThread?.title : undefined}
                rateStatus={rateStatus}
                onSend={sendMessage}
              />
            )}
          </section>
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
}: {
  threadId?: string;
  isLoading: boolean;
  title?: string;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal";
  }) => Promise<SendResult>;
}) {
  const messages = useUIMessages(
    api.messages.list,
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

  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-6">
        {isLoading ? (
          <CenteredLoading label="Loading thread..." />
        ) : hasMessages ? (
          <div className="grid gap-7">
            {sortedMessages.map((message) => (
              <MessageRow key={message.key ?? message.id} message={message} />
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
        onSend={onSend}
      />
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const text = getMessageText(message);

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
        <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--ink-soft)]">
          {text}
          {message.status === "streaming" ? (
            <span className="stream-caret ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-primary" />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Composer({
  threadId,
  disabled,
  rateStatus,
  onSend,
}: {
  threadId?: string;
  disabled: boolean;
  rateStatus: RateStatus | undefined;
  onSend: (args: {
    threadId: string;
    content: string;
    mode: "normal";
  }) => Promise<SendResult>;
}) {
  const [content, setContent] = useState("");
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (localRetryAt && localRetryAt <= now) {
      setLocalRetryAt(null);
    }
  }, [localRetryAt, now]);

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
        mode: "normal",
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
        <div className="mb-3 rounded-[10px] border border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] px-3 py-2 text-sm font-medium text-[var(--lavender)]">
          Perlu istirahat sebentar. Coba lagi dalam {retrySeconds || 1} detik.
        </div>
      ) : null}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={8000}
        placeholder={
          threadId ? "Tulis pertanyaan riset..." : "Buat thread baru dulu..."
        }
        className="min-h-24 w-full resize-none rounded-[10px] border border-input bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full border bg-muted p-1 text-xs font-semibold">
          <span className="rounded-full bg-card px-3 py-1 text-foreground">
            Normal
          </span>
        </div>
        <Button type="submit" disabled={!canSend}>
          {isSending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SendHorizontalIcon className="size-4" />
          )}
          Send
        </Button>
      </div>
    </form>
  );
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
