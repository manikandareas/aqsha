import { promptCommands } from "@aqsha/convex/prompt-commands";
import { api } from "@aqsha/convex/api";
import type { OptimisticLocalStore } from "convex/browser";
import { insertAtTop } from "convex/react";
import { previewFromComposerContent } from "../utils/composer-model";
import type { MessageContextArtifactMetadata, PromptCommandMetadata } from "../types";

export function optimisticallyInsertUserMessage(
  store: OptimisticLocalStore,
  args: {
    threadId: string;
    text: string;
    promptCommand?: PromptCommandMetadata;
    contextArtifacts?: MessageContextArtifactMetadata[];
  },
) {
  const queries = store.getAllQueries(api.agent.messages.list);
  let maxOrder = -1;
  for (const query of queries) {
    if (query.args?.threadId !== args.threadId) continue;
    if (query.args.streamArgs) continue;
    for (const message of query.value?.page ?? []) {
      maxOrder = Math.max(maxOrder, message.order);
    }
  }
  const order = maxOrder + 1;
  const stepOrder = 0;
  const id = randomId();
  insertAtTop({
    paginatedQuery: api.agent.messages.list,
    argsToMatch: { threadId: args.threadId, streamArgs: undefined },
    item: {
      _creationTime: Date.now(),
      id,
      key: `${args.threadId}-${order}-${stepOrder}`,
      order,
      stepOrder,
      status: "pending",
      parts: [{ type: "text", text: args.text }],
      role: "user",
      text: args.text,
      metadata:
        args.promptCommand || args.contextArtifacts?.length
          ? {
              ...(args.promptCommand ? { promptCommand: args.promptCommand } : {}),
              ...(args.contextArtifacts?.length
                ? { contextArtifacts: args.contextArtifacts }
                : {}),
            }
          : undefined,
    },
    localQueryStore: store,
  });
}

export function promptCommandMetadataForContent(args: {
  commandId?: string;
  content: string;
}) {
  const command = args.commandId
    ? promptCommands.find((item) => item.id === args.commandId)
    : undefined;

  return command
    ? {
        commandId: command.id,
        commandLabel: command.label,
        commandSlug: command.slug,
        mode: command.mode,
        argumentPreview: previewFromComposerContent(args.content, command),
      }
    : undefined;
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
