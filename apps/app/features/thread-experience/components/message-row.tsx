"use client";

import { api } from "@aqsha/convex/api";
import { useQuery } from "convex/react";
import { FileTextIcon, FolderTreeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  PromptCommandMetadata,
  ResearchArtifact,
} from "../types";
import { ThreadActivityIndicator } from "./shared";

export function MessageRow({
  message,
  sourceCount = 0,
}: {
  message: ChatMessage;
  sourceCount?: number;
}) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const text = getMessageText(message);
  const hasText = Boolean(text.trim());
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
      <MessageContent className="w-full min-w-0 overflow-hidden bg-transparent px-0 py-0 text-[13px] leading-[1.55] text-ink-soft">
        {hasText ? (
          <MessageResponse className="aqsha-prose aqsha-prose-message">
            {text}
          </MessageResponse>
        ) : isStreaming ? (
          <ThreadActivityIndicator label="Sedang menulis..." />
        ) : null}
      </MessageContent>
      <MessageArtifacts links={messageArtifacts ?? []} />
      <MessageSourceCount sourceCount={sourceCount} />
    </Message>
  );
}

type MessageArtifactLink = {
  artifactId: string;
  versionId: string;
  relation: "created" | "updated" | "referenced";
  artifact: ResearchArtifact & { workspaceId?: string };
  version: NonNullable<ResearchArtifact["version"]>;
};

function MessageArtifacts({ links }: { links: MessageArtifactLink[] }) {
  const router = useRouter();
  if (links.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2">
      {links.map((link) => {
        const workspaceId = link.artifact.workspaceId;
        const canOpen = Boolean(workspaceId);

        return (
          <button
            key={`${link.artifactId}-${link.versionId}`}
            type="button"
            disabled={!canOpen}
            onClick={() => {
              if (!workspaceId) return;
              router.push(`/workspaces/${workspaceId}/artifacts/${link.artifactId}`);
            }}
            className={cn(
              "flex max-w-xl items-center gap-3 rounded-[10px] border border-lavender-soft-border bg-lavender-soft px-3 py-2 text-left text-[13px] text-lavender-foreground transition-colors",
              canOpen ? "hover:bg-lavender-soft" : "cursor-default bg-muted text-muted-foreground",
            )}
          >
            <FileTextIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {link.artifact.title}
              </span>
              <span className="block text-[11px] font-medium text-muted-foreground">
                {link.relation === "updated" ? "Diperbarui" : "Artefak"} · v
                {link.version.versionNumber}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MessageSourceCount({ sourceCount }: { sourceCount: number }) {
  if (sourceCount <= 0) return null;

  return (
    <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-[8px] border border-border/70 bg-muted/35 px-2 py-1 text-[11px] font-medium text-muted-foreground">
      <FolderTreeIcon className="size-3.5" />
      <span>{sourceCount} sumber</span>
    </span>
  );
}

function PromptCommandChip({ command }: { command: PromptCommandMetadata }) {
  return (
    <span
      contentEditable={false}
      className={cn(
        "mr-1.5 inline-flex translate-y-[-1px] items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
        command.mode === "deep"
          ? "border-lavender-soft-border bg-lavender-soft text-lavender-foreground"
          : "border-sky-soft-border bg-sky-soft text-sky-foreground",
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
