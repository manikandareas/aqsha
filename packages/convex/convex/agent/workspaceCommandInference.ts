import { findExplicitPromptCommandInContent } from "./promptCommandParsing";

export type WorkspaceSummary = {
  workspaceId: string;
  name: string;
};

export type WorkspaceManagementIntent = "create" | "rename";

const READ_ONLY_PATTERN =
  /\b(jelaskan|explain|apa\s+itu|what\s+is|list|daftar|tampilkan|show\s+all)\b/i;

const CREATE_PATTERN =
  /\b(buat(?:kan)?|bikin|create|new)\b[\s\S]{0,40}\bworkspace\b|\bworkspace\s+(?:baru|new)\b|\bbuat(?:kan)?\s+(?:workspace|ruang kerja)\b/i;

const RENAME_PATTERN =
  /\b(rename|ganti\s+nama|ubah\s+nama|perbarui\s+nama|rename\s+workspace)\b/i;

export { findExplicitPromptCommandInContent };

export function detectWorkspaceManagementIntent(
  prompt: string,
): WorkspaceManagementIntent | null {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const hasCreate = CREATE_PATTERN.test(normalized);
  const hasRename = RENAME_PATTERN.test(normalized);

  if (!hasCreate && !hasRename) {
    return null;
  }

  if (READ_ONLY_PATTERN.test(normalized) && !hasRename && !hasCreate) {
    return null;
  }

  if (hasRename) {
    return "rename";
  }
  if (hasCreate) {
    return "create";
  }

  return null;
}

export function shouldAutoRouteWorkspaceCommand(args: {
  prompt: string;
  explicitCommandId?: string;
}) {
  if (args.explicitCommandId) {
    return false;
  }
  if (findExplicitPromptCommandInContent(args.prompt)) {
    return false;
  }
  return detectWorkspaceManagementIntent(args.prompt) !== null;
}

export function buildAutoWorkspaceRoutingHint(
  workspaces: WorkspaceSummary[],
  intent: WorkspaceManagementIntent,
) {
  const lines = [
    "The user asked to manage workspaces (auto-routed to /workspace).",
    `Detected intent: ${intent === "create" ? "create_workspace" : "rename_workspace"}.`,
  ];

  if (workspaces.length > 0) {
    lines.push("Existing active workspaces:");
    for (const [index, workspace] of workspaces.entries()) {
      lines.push(
        `${index + 1}. "${workspace.name}" (workspaceId: ${workspace.workspaceId})`,
      );
    }
  } else {
    lines.push("The user has no active workspaces yet.");
  }

  if (intent === "rename") {
    lines.push(
      "Use renameWorkspace. Include workspaceId when the target is clear; otherwise askUser first.",
    );
  } else {
    lines.push(
      "Use createWorkspace after any needed askUser clarification.",
    );
  }

  return lines.join("\n");
}
