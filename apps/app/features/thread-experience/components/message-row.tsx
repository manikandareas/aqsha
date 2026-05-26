"use client";

import { api } from "@aqsha/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  FileTextIcon,
  FolderTreeIcon,
  LayoutGridIcon,
  Link2Icon,
  LinkIcon,
  Loader2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toArtifactId, toWorkspaceId } from "@/lib/convex-refs";
import { cn } from "@/lib/utils";
import { WorkspacePickerDialog } from "@/features/workspaces/components/workspace-picker-dialog";
import type {
  ChatMessage,
  MessageContextArtifactMetadata,
  PromptCommandMetadata,
  ResearchArtifact,
} from "../types";
import { ThreadActivityIndicator } from "./shared";

export function MessageRow({
  message,
  sourceCount = 0,
  threadWorkspaceId,
}: {
  message: ChatMessage;
  sourceCount?: number;
  threadWorkspaceId?: string;
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
    const contextArtifacts = message.metadata?.contextArtifacts ?? [];
    const displayText = promptCommand
      ? stripVisibleCommandText(text, promptCommand)
      : text;
    return (
      <div className="flex w-full min-w-0 flex-col items-end gap-2 overflow-x-hidden">
        {contextArtifacts.length > 0 ? (
          <UserMessageContextArtifacts
            artifacts={contextArtifacts}
            threadWorkspaceId={threadWorkspaceId}
          />
        ) : null}
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
  versionId?: string;
  relation: "created" | "updated" | "referenced" | "deleted";
  artifact: ResearchArtifact & { workspaceId?: string };
  version: NonNullable<ResearchArtifact["version"]> | null;
  linkKind?: "versioned" | "workspace";
};

function UserMessageContextArtifacts({
  artifacts,
  threadWorkspaceId,
}: {
  artifacts: MessageContextArtifactMetadata[];
  threadWorkspaceId?: string;
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2 sm:max-w-[560px]">
      {artifacts.map((artifact) => (
        <UserMessageContextArtifactCard
          key={artifact.artifactId}
          artifact={artifact}
          threadWorkspaceId={threadWorkspaceId}
        />
      ))}
    </div>
  );
}

function UserMessageContextArtifactCard({
  artifact,
  threadWorkspaceId,
}: {
  artifact: MessageContextArtifactMetadata;
  threadWorkspaceId?: string;
}) {
  const router = useRouter();
  const saveAttachment = useMutation(api.artifacts.saveAttachmentToWorkspace);
  const workspacePage = useQuery(api.workspaces.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedState, setSavedState] = useState<{
    workspaceId: string;
    workspaceName: string;
  } | null>(
    artifact.savedWorkspaceId
      ? {
          workspaceId: artifact.savedWorkspaceId,
          workspaceName: artifact.savedWorkspaceName ?? "Workspace",
        }
      : null,
  );
  const presentation = getContextArtifactPresentation(artifact);
  const workspaceCount = workspacePage?.page.length ?? 0;
  const canSave =
    artifact.source === "upload" &&
    !savedState &&
    artifact.kind !== "url";
  const requiresPicker = canSave && !threadWorkspaceId && workspaceCount > 1;

  const handleSave = async (workspaceId?: string) => {
    setIsSaving(true);
    try {
      const result = await saveAttachment({
        artifactId: toArtifactId(artifact.artifactId),
        workspaceId: workspaceId ? toWorkspaceId(workspaceId) : undefined,
      });
      setSavedState({
        workspaceId: String(result.workspaceId),
        workspaceName: result.workspaceName,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative flex w-[168px] max-w-full shrink-0 flex-col overflow-hidden rounded-[10px] border bg-card shadow-sm",
          presentation.borderClass,
        )}
      >
        <div
          className={cn(
            "relative flex h-[52px] items-end justify-start overflow-hidden px-2.5 pb-2 pt-2.5",
            presentation.surfaceClass,
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 size-4 bg-background/35"
            style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
          />
          <presentation.Icon className={cn("size-4 shrink-0", presentation.iconClass)} />
        </div>
        <div className="border-t border-border/60 px-2.5 py-2">
          <p className="truncate text-[11px] font-semibold leading-snug text-foreground">
            {artifact.title}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">
            {savedState
              ? `Di ${savedState.workspaceName}`
              : artifact.source === "upload"
                ? "Lampiran chat"
                : presentation.label}
          </p>
          {savedState ? (
            <Link
              href={`/workspaces/${savedState.workspaceId}`}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              Buka workspace
            </Link>
          ) : canSave ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isSaving}
                  aria-label="Simpan ke workspace"
                  onClick={() => {
                    if (requiresPicker) {
                      setPickerOpen(true);
                      return;
                    }
                    void handleSave(threadWorkspaceId);
                  }}
                  className="mt-2 inline-flex size-6 items-center justify-center rounded-full border border-border/80 bg-background text-foreground transition-colors hover:bg-muted/40 disabled:opacity-60"
                >
                  {isSaving ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <Link2Icon className="size-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Simpan ke workspace
              </TooltipContent>
            </Tooltip>
          ) : artifact.source === "workspace" && artifact.savedWorkspaceId ? (
            <button
              type="button"
              onClick={() => router.push(`/workspaces/${artifact.savedWorkspaceId}`)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              Buka workspace
            </button>
          ) : null}
        </div>
      </div>
      <WorkspacePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(workspaceId) => handleSave(workspaceId)}
      />
    </>
  );
}

function getContextArtifactPresentation(artifact: MessageContextArtifactMetadata) {
  if (artifact.kind === "url") {
    return {
      Icon: LinkIcon,
      label: "Tautan tersimpan",
      surfaceClass: "bg-sky-soft",
      iconClass: "text-sky-foreground",
      borderClass: "border-sky-soft-border/80",
    };
  }

  if (artifact.source === "upload") {
    return {
      Icon: FileTextIcon,
      label: "Lampiran chat",
      surfaceClass: "bg-mint-soft",
      iconClass: "text-mint-foreground",
      borderClass: "border-mint-soft-border/80",
    };
  }

  return {
    Icon: LayoutGridIcon,
    label: "Artifact workspace",
    surfaceClass: "bg-muted/45",
    iconClass: "text-muted-foreground",
    borderClass: "border-border/80",
  };
}

function MessageArtifacts({ links }: { links: MessageArtifactLink[] }) {
  const router = useRouter();
  if (links.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2">
      {links.map((link) => {
        const workspaceId = link.artifact.workspaceId;
        const canOpen = Boolean(workspaceId) && link.relation !== "deleted";

        return (
          <button
            key={`${link.artifactId}-${link.versionId ?? "workspace"}`}
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
                {link.relation === "deleted"
                  ? "Dihapus dari workspace"
                  : link.relation === "updated"
                    ? "Diperbarui di workspace"
                    : link.linkKind === "workspace" || workspaceId
                      ? "Artefak workspace"
                      : "Artefak"}
                {link.version ? ` · v${link.version.versionNumber}` : ""}
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
      <span>{sourceCount} referensi</span>
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
