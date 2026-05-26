import { promptCommands, type PromptCommand } from "@aqsha/convex/prompt-commands";
import type {
  ComposerCommand,
  ComposerSubmission,
  ResearchRun,
  SendResult,
} from "../types";
import { isRunActive } from "./transcript-model";

export function findPromptCommandInContent(content: string) {
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

export function stripCommandFromContent(content: string, command: PromptCommand) {
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

export function createVisibleComposerContent(
  content: string,
  command: ComposerCommand,
) {
  const trimmed = content.trim();
  if (!command) {
    return content;
  }
  return trimmed.length > 0 ? `${command.slug} ${trimmed}` : command.slug;
}

export function stripCommandFromSubmittedContent(
  content: string,
  command: ComposerCommand,
) {
  return command ? stripCommandFromContent(content, command) : content;
}

export function buildComposerSubmission({
  content,
  selectedCommand,
  mode,
}: {
  content: string;
  selectedCommand: ComposerCommand;
  mode: "normal" | "deep";
}): ComposerSubmission {
  const visibleContent = createVisibleComposerContent(content, selectedCommand);
  const command = selectedCommand ?? findPromptCommandInContent(visibleContent);
  return {
    content: visibleContent.trim(),
    mode: command?.mode === "deep" ? "deep" : mode,
    commandId: command?.id,
  };
}

export function restoreComposerContentAfterBlockedSend(
  submittedContent: string,
  command: ComposerCommand,
) {
  return stripCommandFromSubmittedContent(submittedContent, command);
}

export function shouldShowStopForActiveRun(activeRun: ResearchRun | undefined) {
  return Boolean(activeRun && activeRun.mode === "deep" && isRunActive(activeRun));
}

export function getComposerAvailability({
  visibleContent,
  disabled,
  isSending,
  isRateLimited,
  activeRun,
  hasAttachments = false,
}: {
  visibleContent: string;
  hasAttachments?: boolean;
  disabled: boolean;
  isSending: boolean;
  isRateLimited: boolean;
  activeRun?: ResearchRun;
}) {
  const isDeepActive = shouldShowStopForActiveRun(activeRun);
  return {
    isDeepActive,
    canSend:
      (visibleContent.trim().length > 0 || hasAttachments) &&
      !disabled &&
      !isSending &&
      !isRateLimited &&
      !isDeepActive,
    stopRunId: isDeepActive ? activeRun?._id : undefined,
  };
}

export function isSendBlockedByBilling(result: SendResult) {
  return (
    !result.ok &&
    (result.reason === "quota_exceeded" ||
      result.reason === "subscription_required" ||
      result.reason === "billing_inactive")
  );
}
