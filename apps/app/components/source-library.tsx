"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  FilePlus2Icon,
  Loader2Icon,
  PlusIcon,
  ScrollTextIcon,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@aqsha/convex/api";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SourceMode = "manual_text" | "url" | "doi" | "arxiv" | "uploaded_text";

export function SourceLibrary() {
  const router = useRouter();
  const viewer = useQuery(api.auth.getCurrentUser);
  const threadPage = useQuery(api.agent.threads.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const sources = useQuery(api.agent.corpus.list);
  const addSource = useAction(api.agent.corpus.addSource);
  const createThread = useMutation(api.agent.threads.create);
  const [mode, setMode] = useState<SourceMode>("manual_text");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateThread = async () => {
    setIsCreating(true);
    try {
      const result = await createThread({});
      router.push(`/thread/${result.threadId}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isAdding) {
      return;
    }
    setIsAdding(true);
    setNotice(null);
    try {
      const input =
        mode === "url"
          ? { type: "url" as const, url: trimmed, title: optional(title) }
          : mode === "doi"
            ? { type: "doi" as const, doi: trimmed, title: optional(title) }
            : mode === "arxiv"
              ? { type: "arxiv" as const, arxivId: trimmed, title: optional(title) }
              : {
                  type: mode,
                  title: title.trim() || "Untitled source",
                  text: trimmed,
                };
      const result = await addSource({ input });
      setNotice(
        result.status === "metadata_only"
          ? "Metadata tersimpan; evidence masih lemah sampai ada abstract atau teks."
          : result.status === "failed"
            ? "Sumber tersimpan, tapi indexing gagal."
            : "Sumber tersimpan.",
      );
      setTitle("");
      setValue("");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar
        viewer={viewer}
        threads={threadPage?.page ?? []}
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
            <h1 className="truncate font-heading text-lg font-bold">
              Source Library
            </h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[380px_1fr]">
          <section className="h-fit rounded-[8px] border bg-card p-4 shadow-aqsha">
            <div className="mb-4 flex items-center gap-2">
              <FilePlus2Icon className="size-4 text-[var(--mint)]" />
              <h2 className="font-heading text-base font-bold">Add Source</h2>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {sourceModes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={cn(
                    "rounded-[8px] border px-3 py-2 text-left text-sm font-semibold",
                    mode === item.value
                      ? "border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint)]"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="grid gap-3">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
              />
              {mode === "manual_text" || mode === "uploaded_text" ? (
                <textarea
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={
                    mode === "uploaded_text"
                      ? "Paste uploaded text"
                      : "Paste source text"
                  }
                  className="min-h-44 resize-none rounded-[8px] border border-input bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              ) : (
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={
                    mode === "url"
                      ? "https://..."
                      : mode === "doi"
                        ? "10.xxxx/..."
                        : "2401.12345"
                  }
                />
              )}
              {notice ? (
                <p className="rounded-[8px] border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-3 py-2 text-sm text-[var(--mint)]">
                  {notice}
                </p>
              ) : null}
              <Button type="submit" disabled={!value.trim() || isAdding}>
                {isAdding ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                Add
              </Button>
            </form>
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <ScrollTextIcon className="size-4 text-[var(--mint)]" />
              <h2 className="font-heading text-base font-bold">Saved Sources</h2>
            </div>
            <div className="grid gap-3">
              {sources === undefined ? (
                <div className="flex items-center gap-2 rounded-[8px] border bg-card p-4 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Loading sources...
                </div>
              ) : sources.length === 0 ? (
                <div className="rounded-[8px] border border-dashed bg-card p-6 text-sm text-muted-foreground">
                  Belum ada sumber.
                </div>
              ) : (
                sources.map((source) => (
                  <article
                    key={source._id}
                    className="rounded-[8px] border bg-card p-4 shadow-aqsha"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--mint)]">
                        {labelForType(source.sourceType)}
                      </span>
                      <StatusChip status={source.status} />
                    </div>
                    <h3 className="font-semibold">{source.title}</h3>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {source.doi ?? source.arxivId ?? source.url ?? source.locator}
                    </p>
                    {source.snippet ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                        {source.snippet}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

const sourceModes: Array<{ value: SourceMode; label: string }> = [
  { value: "manual_text", label: "Manual text" },
  { value: "url", label: "URL" },
  { value: "doi", label: "DOI" },
  { value: "arxiv", label: "arXiv ID" },
  { value: "uploaded_text", label: "Uploaded text" },
];

function optional(value: string) {
  return value.trim() || undefined;
}

function labelForType(value: SourceMode) {
  return sourceModes.find((item) => item.value === value)?.label ?? value;
}

function StatusChip({ status }: { status: string }) {
  const weak = status === "metadata_only";
  const failed = status === "failed";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-[11px] font-semibold",
        failed
          ? "border-[var(--coral-soft-border)] bg-[var(--coral-soft)] text-[var(--coral)]"
          : weak
            ? "border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] text-[var(--lemon)]"
            : "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]",
      )}
    >
      {failed ? "Needs retry" : weak ? "Metadata only" : "Ready"}
    </span>
  );
}
