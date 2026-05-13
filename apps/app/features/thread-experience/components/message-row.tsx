"use client";

import { api } from "@aqsha/convex/api";
import { useQuery } from "convex/react";
import { FileTextIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import type { ResearchSource } from "@/components/sources-panel";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  PromptCommandMetadata,
  ResearchArtifact,
} from "../types";
import { getSourcesForMessage } from "../utils/transcript-model";

export function MessageRow({
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
    const displayText = promptCommand
      ? stripVisibleCommandText(text, promptCommand)
      : text;
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

function getMessageText(message: ChatMessage) {
  const partText = message.parts
    ?.map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("");
  return partText || message.text || "";
}
