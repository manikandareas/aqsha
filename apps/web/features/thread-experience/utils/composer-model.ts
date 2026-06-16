import {
  matchPromptCommandInContent,
  promptCommands,
  type PromptCommand,
} from "@aqsha/convex/prompt-commands";
import type {
  ComposerSubmission,
  ResearchRun,
} from "../types";
import { isRunActive } from "./transcript-model";

/** Text after a leading `/` while the user is picking a command (no spaces yet). */
export function getSlashFilterQuery(content: string): string | null {
  if (!content.startsWith("/")) {
    return null;
  }
  const query = content.slice(1);
  if (query.includes(" ") || query.includes("\n")) {
    return null;
  }
  return query;
}

export function filterPromptCommandsBySlashQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...promptCommands];
  }
  return promptCommands.filter((command) => {
    const candidates = [
      command.slug,
      ...command.aliases,
      command.label,
      ...command.keywords,
    ];
    return candidates.some((candidate) => {
      const lower = candidate.toLowerCase();
      const withoutSlash = lower.startsWith("/") ? lower.slice(1) : lower;
      return lower.includes(normalized) || withoutSlash.startsWith(normalized);
    });
  });
}

export function resolvePrimaryCommand(
  commands: PromptCommand[],
  visibleContent: string,
): PromptCommand | null {
  if (commands.length === 1) {
    return commands[0] ?? null;
  }
  if (commands.length > 1) {
    const deepCommands = commands.filter((command) => command.mode === "deep");
    if (deepCommands.length === 1) {
      return deepCommands[0] ?? null;
    }
    return null;
  }
  return matchPromptCommandInContent(visibleContent);
}

export function createVisibleComposerContent(content: string) {
  return content;
}

export function buildComposerSubmission({
  visibleContent,
  commands,
  agentKind,
}: {
  visibleContent: string;
  commands: PromptCommand[];
  agentKind: "lite" | "pro";
}): ComposerSubmission {
  // The selected agent (Lite/Pro) is orthogonal to the path: Deep Research is
  // triggered purely by the /deep-research command (resolved into commandId),
  // and the backend derives the deep path from that commandId.
  const trimmed = visibleContent.trim();
  const command = resolvePrimaryCommand(commands, trimmed);
  return {
    content: trimmed,
    agentKind,
    commandId: commands.length === 1 ? commands[0]?.id : command?.id,
  };
}

export function restoreComposerContentAfterBlockedSend(submittedContent: string) {
  return submittedContent;
}

function shouldShowStopForActiveRun(activeRun: ResearchRun | undefined) {
  // Deep Research runs (Lite-deep or Pro-deep) execute as a durable workflow;
  // show the Stop control for any active workflow run.
  return Boolean(activeRun && activeRun.executionKind === "workflow" && isRunActive(activeRun));
}

export function getComposerAvailability({
  visibleContent,
  disabled,
  isSending,
  isRateLimited,
  activeRun,
  hasAttachments = false,
  isGenerating = false,
}: {
  visibleContent: string;
  hasAttachments?: boolean;
  disabled: boolean;
  isSending: boolean;
  isRateLimited: boolean;
  activeRun?: ResearchRun;
  isGenerating?: boolean;
}) {
  const isDeepActive = shouldShowStopForActiveRun(activeRun);
  return {
    isDeepActive,
    canSend:
      (visibleContent.trim().length > 0 || hasAttachments) &&
      !disabled &&
      !isSending &&
      !isRateLimited &&
      !isDeepActive &&
      !isGenerating,
    stopRunId: isDeepActive ? activeRun?._id : undefined,
  };
}
