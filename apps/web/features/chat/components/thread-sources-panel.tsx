import type { UIMessage } from "ai";
import { ExternalLinkIcon, LinkIcon } from "lucide-react";

import type { AgentEvent, ChatSource } from "@/features/chat/lib/types";
import { cn } from "@/lib/utils";

type SourceItem = {
  href: string | null;
  id: string;
  meta: string;
  title: string;
};

type MessagePart = UIMessage["parts"][number];

function partRecord(part: MessagePart): Record<string, unknown> {
  return part as unknown as Record<string, unknown>;
}

function collectSources(messages: UIMessage[], events: AgentEvent[]): SourceItem[] {
  const sources = new Map<string, SourceItem>();

  messages.forEach((message, messageIndex) => {
    message.parts.forEach((part, partIndex) => {
      if (part.type !== "source-url") {
        return;
      }

      const record = partRecord(part);
      const href = typeof record.url === "string" ? record.url : "";

      if (!href || sources.has(href)) {
        return;
      }

      sources.set(href, {
        href,
        id: `${message.id}-source-${partIndex}`,
        meta: `Message ${messageIndex + 1}`,
        title: typeof record.title === "string" ? record.title : href,
      });
    });
  });

  events.forEach((event) => {
    if (event.scope !== "source") {
      return;
    }

    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};
    const href = typeof payload.url === "string" ? payload.url : null;
    const title =
      typeof payload.title === "string"
        ? payload.title
        : event.summary || event.title || href || "Document source";
    const key = href ?? event.id;

    if (sources.has(key)) {
      return;
    }

    sources.set(key, {
      href,
      id: event.id,
      meta: "Agent event",
      title,
    });
  });

  return Array.from(sources.values());
}

function collectStoredSources(sources: ChatSource[]): SourceItem[] {
  return sources.map((source) => ({
    href: source.kind === "url" ? source.url : null,
    id: source.id,
    meta:
      source.kind === "url"
        ? "Web source"
        : source.mediaType || "Document source",
    title:
      source.title ||
      source.filename ||
      source.url ||
      (source.kind === "url" ? "Web source" : "Document source"),
  }));
}

export function ThreadSourcesPanel({
  className,
  messages,
  events = [],
  sources = [],
}: {
  className?: string;
  messages: UIMessage[];
  events?: AgentEvent[];
  sources?: ChatSource[];
}) {
  const sourceItems = mergeSources(
    collectStoredSources(sources),
    collectSources(messages, events),
  );

  return (
    <section
      aria-label="Sources"
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
    >
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LinkIcon className="size-4" />
          <span>Sources</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {sourceItems.length} source{sourceItems.length === 1 ? "" : "s"} in this thread
        </p>
      </div>

      {sourceItems.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {sourceItems.map((source) => (
              <SourceCard
                href={source.href}
                key={source.id}
                meta={source.meta}
                title={source.title}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Sources will appear here after Astra cites web or document references.
        </div>
      )}
    </section>
  );
}

function mergeSources(primary: SourceItem[], fallback: SourceItem[]) {
  const merged = new Map<string, SourceItem>();

  for (const source of [...primary, ...fallback]) {
    const key = source.href ?? `${source.title}:${source.meta}`;

    if (!merged.has(key)) {
      merged.set(key, source);
    }
  }

  return Array.from(merged.values());
}

function SourceCard({
  href,
  meta,
  title,
}: {
  href: string | null;
  meta: string;
  title: string;
}) {
  const className =
    "group flex min-w-0 items-start gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted";
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 font-medium leading-5 text-foreground">
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      {href ? (
        <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      ) : null}
    </>
  );

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a
      className={className}
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  );
}
