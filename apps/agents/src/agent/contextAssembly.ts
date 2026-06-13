import type { RunRequest } from "@aqsha/agent-contracts";
import { clipText, CONTEXT_BUDGET } from "../lib/text";
import type {
  AgentStore,
  ArtifactSnapshot,
  MessageRecord,
  WorkspaceManifest,
} from "../store/types";

// Context assembly (plan §4.2 contextAssembly.ts): builds the prompt blocks
// for a turn from store data, honoring the legacy CONTEXT_BUDGET numbers.
// Thread history normally lives in the SDK session; buildHistoryBlock exists
// for the rebuild path when the session file is lost (plan §4.1 step 3).

export function buildArtifactBlock(artifacts: ArtifactSnapshot[]): string {
  if (artifacts.length === 0) {
    return "";
  }
  const selected = artifacts.slice(0, CONTEXT_BUDGET.selectedArtifacts);
  const sections: string[] = [];
  let used = 0;
  for (const artifact of selected) {
    const remaining = CONTEXT_BUDGET.promptTotalChars - used;
    if (remaining <= 0) {
      break;
    }
    const { text } = clipText(
      artifact.text,
      Math.min(CONTEXT_BUDGET.perArtifactChars, remaining),
    );
    used += text.length;
    sections.push(
      `### ${artifact.title}\nArtifact ID: ${artifact.artifactId}\n${text}`,
    );
  }
  return `<thread_context_artifacts>\n${sections.join("\n\n")}\n</thread_context_artifacts>`;
}

export function buildWorkspaceManifestBlock(manifests: WorkspaceManifest[]): string {
  if (manifests.length === 0) {
    return "";
  }
  const sections = manifests
    .slice(0, CONTEXT_BUDGET.workspaceManifestWorkspaces)
    .map((manifest) => {
      const items = manifest.items
        .slice(0, CONTEXT_BUDGET.workspaceManifestItems)
        .map((item) => `- ${item.title} (Artifact ID: ${item.artifactId})`)
        .join("\n");
      return `## Workspace: ${manifest.name} (Workspace ID: ${manifest.workspaceId})\n${items || "- (empty)"}`;
    });
  return `<thread_workspace_context>\n${sections.join("\n\n")}\n</thread_workspace_context>`;
}

export function buildRagBlock(ragText: string): string {
  if (!ragText.trim()) {
    return "";
  }
  const { text } = clipText(ragText, CONTEXT_BUDGET.ragTotalChars);
  return `<retrieved_context>\n${text}\n</retrieved_context>`;
}

// Fallback history reconstruction when the SDK session is gone: the recent
// thread transcript from first-party messages, oldest first.
export function buildHistoryBlock(messages: MessageRecord[]): string {
  const lines = messages
    .filter((message) => message.text.trim())
    .map((message) => {
      const speaker = message.role === "assistant" ? "Astra" : message.role;
      const { text } = clipText(message.text, 2_000);
      return `${speaker}: ${text}`;
    });
  if (lines.length === 0) {
    return "";
  }
  return `<thread_history>\n${lines.join("\n")}\n</thread_history>`;
}

export type AssembledPrompt = {
  prompt: string;
  blocks: { artifacts: boolean; manifest: boolean; history: boolean };
};

/**
 * Assemble the full prompt for a turn. Slash-command prompts (other than the
 * service-intercepted /deep) pass through verbatim after the context blocks so
 * the SDK can expand them (plan §5.4).
 */
export async function assemblePrompt(input: {
  store: AgentStore;
  request: RunRequest;
  includeHistory: boolean;
  historyLimit?: number;
}): Promise<AssembledPrompt> {
  const { store, request } = input;
  const [artifacts, manifests, history] = await Promise.all([
    request.contextRefs.artifactIds.length > 0
      ? store.listContextArtifacts(request.threadId, request.contextRefs.artifactIds)
      : Promise.resolve([]),
    request.contextRefs.workspaceIds.length > 0
      ? store.getWorkspaceManifests(request.ownerUserId, request.contextRefs.workspaceIds)
      : Promise.resolve([]),
    input.includeHistory
      ? store.listMessages(request.threadId, input.historyLimit ?? 30)
      : Promise.resolve([]),
  ]);

  const artifactBlock = buildArtifactBlock(artifacts);
  const manifestBlock = buildWorkspaceManifestBlock(manifests);
  const historyBlock = buildHistoryBlock(
    // Exclude the just-written prompt message from the rebuilt history.
    history.filter((message) => message.runId !== request.runId),
  );

  const blocks = [artifactBlock, manifestBlock, historyBlock].filter(Boolean);
  const prompt =
    blocks.length > 0 ? `${blocks.join("\n\n")}\n\n${request.prompt}` : request.prompt;

  return {
    prompt,
    blocks: {
      artifacts: Boolean(artifactBlock),
      manifest: Boolean(manifestBlock),
      history: Boolean(historyBlock),
    },
  };
}
