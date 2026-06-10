import type { MutationCtx } from "../../_generated/server";
import { listActiveWorkspacesForOwner } from "../../workspaces";
import {
  buildAutoArtifactRoutingHint,
  detectWorkspaceArtifactMutationIntent,
  shouldAutoRouteArtifactCommand,
} from "../tools/artifactCommandInference";
import {
  buildAutoWorkspaceRoutingHint,
  detectWorkspaceManagementIntent,
  shouldAutoRouteWorkspaceCommand,
} from "../tools/workspaceCommandInference";
import { appendRoutingHint, promptPayloadFromCommand, type PromptPayload } from "./promptPayload";
import { listSelectedWorkspaceDocuments } from "../context/threadContext";

type AutoRouteResult =
  | { commandId: "artifact"; routingHint: string }
  | { commandId: "workspace"; routingHint: string }
  | null;

export async function resolveAutoRoute(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    content: string;
  },
): Promise<AutoRouteResult> {
  if (shouldAutoRouteWorkspaceCommand({ prompt: args.content })) {
    const intent = detectWorkspaceManagementIntent(args.content);
    if (intent) {
      const workspaces = await listActiveWorkspacesForOwner(ctx, args.ownerUserId);
      const workspaceSummaries = workspaces.map((workspace) => ({
        workspaceId: String(workspace._id),
        name: workspace.name,
      }));
      return {
        commandId: "workspace",
        routingHint: buildAutoWorkspaceRoutingHint(workspaceSummaries, intent),
      };
    }
  }

  const selectedWorkspaceDocuments = await listSelectedWorkspaceDocuments(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });

  if (
    shouldAutoRouteArtifactCommand({
      prompt: args.content,
      selectedWorkspaceDocuments,
    })
  ) {
    const intent = detectWorkspaceArtifactMutationIntent(args.content);
    if (intent) {
      return {
        commandId: "artifact",
        routingHint: buildAutoArtifactRoutingHint(selectedWorkspaceDocuments, intent),
      };
    }
  }

  return null;
}

export async function resolvePromptPayload(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    content: string;
    commandId?: string;
  },
): Promise<PromptPayload> {
  if (args.commandId) {
    return promptPayloadFromCommand(args);
  }

  const autoRoute = await resolveAutoRoute(ctx, args);
  if (autoRoute) {
    const basePayload = promptPayloadFromCommand({
      content: args.content,
      commandId: autoRoute.commandId,
      autoRouted: true,
    });
    return appendRoutingHint(basePayload, autoRoute.routingHint);
  }

  return promptPayloadFromCommand(args);
}
