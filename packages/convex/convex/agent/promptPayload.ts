import { ConvexError } from "convex/values";
import { buildPromptCommandPrompt, getPromptCommand, type PromptCommandMode } from "./promptCommands";

function previewFromContent(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function stripCommandSlug(content: string, command: NonNullable<ReturnType<typeof getPromptCommand>>) {
  const trimmed = content.trim();
  const slugs = [command.slug, ...command.aliases].sort((a, b) => b.length - a.length);
  for (const slug of slugs) {
    if (trimmed === slug) {
      return "";
    }
    if (trimmed.startsWith(`${slug} `) || trimmed.startsWith(`${slug}\n`)) {
      return trimmed.slice(slug.length).trim();
    }
  }
  return trimmed;
}

export type PromptPayload = {
  visibleContent: string;
  expandedPrompt: string;
  mode: "normal" | "deep";
  commandMetadata: {
    commandId: string;
    commandLabel: string;
    commandSlug: string;
    mode: PromptCommandMode;
    argumentPreview: string;
    expandedPromptSnapshot: string;
  } | null;
};

export function promptPayloadFromCommand(args: {
  content: string;
  mode: "normal" | "deep";
  commandId?: string;
  autoRouted?: boolean;
}): PromptPayload {
  if (!args.commandId) {
    return {
      visibleContent: args.content,
      expandedPrompt: args.content,
      mode: args.mode,
      commandMetadata: null,
    };
  }

  const command = getPromptCommand(args.commandId);
  if (!command) {
    throw new ConvexError("Unknown prompt command");
  }
  const argument = args.autoRouted
    ? args.content.trim()
    : stripCommandSlug(args.content, command);
  const compiled = buildPromptCommandPrompt(command.id, argument);
  if (!compiled) {
    throw new ConvexError("Unknown prompt command");
  }
  const visibleContent = args.autoRouted
    ? args.content.trim()
    : argument.length > 0
      ? `${command.slug} ${argument}`
      : command.slug;
  return {
    visibleContent,
    expandedPrompt: compiled.expandedPrompt,
    mode: command.mode === "deep" ? ("deep" as const) : args.mode,
    commandMetadata: {
      commandId: command.id,
      commandLabel: command.label,
      commandSlug: command.slug,
      mode: command.mode,
      argumentPreview: previewFromContent(argument),
      expandedPromptSnapshot: compiled.expandedPrompt,
    },
  };
}

export function appendRoutingHint(base: PromptPayload, routingHint: string): PromptPayload {
  return {
    ...base,
    expandedPrompt: [base.expandedPrompt, "", routingHint].join("\n"),
    commandMetadata: base.commandMetadata
      ? {
          ...base.commandMetadata,
          expandedPromptSnapshot: [
            base.commandMetadata.expandedPromptSnapshot,
            "",
            routingHint,
          ].join("\n"),
        }
      : null,
  };
}
