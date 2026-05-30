import { promptCommands, type PromptCommand } from "@aqsha/convex/prompt-commands";
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

function findPromptCommandInContent(content: string) {
  const trimmed = content.trim();
  return (
    promptCommands.find((command) =>
      [command.slug, ...command.aliases].some(
        (slug) =>
          trimmed === slug ||
          trimmed.startsWith(`${slug} `) ||
          trimmed.startsWith(`${slug}\n`),
      ),
    ) ?? null
  );
}

export function previewFromComposerContent(content: string, command: PromptCommand) {
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
  return findPromptCommandInContent(visibleContent);
}

export function createVisibleComposerContent(content: string) {
  return content;
}

export function buildComposerSubmission({
  visibleContent,
  commands,
  mode,
}: {
  visibleContent: string;
  commands: PromptCommand[];
  mode: "normal" | "deep";
}): ComposerSubmission {
  const trimmed = visibleContent.trim();
  const command = resolvePrimaryCommand(commands, trimmed);
  const hasDeepCommand = commands.some((item) => item.mode === "deep");
  const resolvedMode =
    commands.length === 1 && commands[0]
      ? commands[0].mode
      : hasDeepCommand || command?.mode === "deep"
        ? "deep"
        : mode;
  return {
    content: trimmed,
    mode: resolvedMode,
    commandId: commands.length === 1 ? commands[0]?.id : command?.id,
  };
}

export function restoreComposerContentAfterBlockedSend(submittedContent: string) {
  return submittedContent;
}

function shouldShowStopForActiveRun(activeRun: ResearchRun | undefined) {
  return Boolean(activeRun && activeRun.mode === "deep" && isRunActive(activeRun));
}

export function getComposerAvailability({
  visibleContent,
  disabled,
  isSending,
  isRateLimited,
  activeRun,
  hasAttachments = false,
  hitlBlocking = false,
}: {
  visibleContent: string;
  hasAttachments?: boolean;
  disabled: boolean;
  isSending: boolean;
  isRateLimited: boolean;
  activeRun?: ResearchRun;
  hitlBlocking?: boolean;
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
      !hitlBlocking,
    stopRunId: isDeepActive ? activeRun?._id : undefined,
  };
}
