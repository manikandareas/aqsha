"use client";

import type { UIMessage } from "ai";
import * as React from "react";

import { FileTree, type FileNode } from "@/components/ui/file-tree";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
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

function collectSources(
  messages: UIMessage[],
  events: AgentEvent[],
): SourceItem[] {
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
  const sourceItems = React.useMemo(
    () => mergeSources(collectStoredSources(sources), collectSources(messages, events)),
    [events, messages, sources],
  );
  const fileTreeData = React.useMemo(
    () => createSourceFileTree(sourceItems),
    [sourceItems],
  );

  return (
    <Sidebar
      aria-label="Sources"
      className={cn(
        "h-full bg-background text-foreground [--sidebar-width:30rem]",
        className,
      )}
      collapsible="none"
      side="right"
    >
      <SidebarContent className="min-h-0 gap-0 overflow-hidden">
        {sourceItems.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
            <FileTree
              className="h-full bg-card/70"
              data={fileTreeData}
              title="source explorer"
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Sources will appear here after Astra cites web or document
            references.
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

function createSourceFileTree(sourceItems: SourceItem[]): FileNode[] {
  const groups = new Map<string, FileNode>();

  sourceItems.forEach((source) => {
    const group = groups.get(source.meta) ?? {
      children: [],
      name: source.meta,
      type: "folder" as const,
    };

    group.children?.push({
      extension: source.href ? "url" : "document",
      href: source.href,
      name: source.title,
      subtitle: source.href || source.meta,
      type: "file" as const,
    });
    groups.set(source.meta, group);
  });

  return [
    {
      children: Array.from(groups.values()),
      name: "thread sources",
      type: "folder" as const,
    },
  ];
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
