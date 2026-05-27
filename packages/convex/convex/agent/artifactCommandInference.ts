import { findExplicitPromptCommandInContent } from "./promptCommandParsing";

export type WorkspaceDocumentContextTarget = {
  artifactId: string;
  workspaceId: string;
  title: string;
};

export type WorkspaceArtifactMutationIntent = "create" | "update" | "delete";

const WORKSPACE_KEYWORD_PATTERN = /\b(workspace|ruang\s+kerja)\b/i;

const READ_ONLY_PATTERN =
  /\b(jelaskan|explain|ringkas(?:kan)?|summarize|summary|apa\s+isi|what\s+is|analisis|analyze|bandingkan|compare|baca(?:kan)?|read\s+this|terangkan|deskripsikan)\b/i;

const DELETE_PATTERN = /\b(hapus|delete|remove|buang|hilangkan)\b/i;

const CREATE_PATTERN =
  /\b(buat(?:kan)?|bikin|create|tulis\s+(?:dokumen|cerita|artikel|baru)|new\s+document)\b/i;

const UPDATE_PATTERN =
  /\b(edit|perbarui|update|ubah|revisi|revise|rewrite|tulis\s+ulang|perbaiki|fix|tambah(?:kan)?|kurangi|singkat(?:kan)?|perpanjang|extend|modify|change|ganti)\b/i;

const IMPLICIT_EDIT_PATTERN =
  /\b(pakai|gunakan|masukkan|sisipkan|integrasi(?:kan)?)\b[\s\S]{0,80}\b(ke\s+dalam|into|to)\b/i;

export { findExplicitPromptCommandInContent };

export function detectWorkspaceArtifactMutationIntent(
  prompt: string,
): WorkspaceArtifactMutationIntent | null {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized || WORKSPACE_KEYWORD_PATTERN.test(normalized)) {
    return null;
  }

  const hasDelete = DELETE_PATTERN.test(normalized);
  const hasCreate = CREATE_PATTERN.test(normalized);
  const hasUpdate =
    UPDATE_PATTERN.test(normalized) || IMPLICIT_EDIT_PATTERN.test(normalized);

  if (!hasDelete && !hasCreate && !hasUpdate) {
    return null;
  }

  if (
    READ_ONLY_PATTERN.test(normalized) &&
    !hasDelete &&
    !hasUpdate &&
    !(hasCreate && !hasUpdate)
  ) {
    return null;
  }

  if (hasDelete) {
    return "delete";
  }
  if (hasUpdate) {
    return "update";
  }
  if (hasCreate) {
    return "create";
  }

  return null;
}

export function shouldAutoRouteArtifactCommand(args: {
  prompt: string;
  selectedWorkspaceDocuments: WorkspaceDocumentContextTarget[];
  explicitCommandId?: string;
}) {
  if (args.explicitCommandId) {
    return false;
  }
  if (findExplicitPromptCommandInContent(args.prompt)) {
    return false;
  }
  if (args.selectedWorkspaceDocuments.length === 0) {
    return false;
  }
  if (WORKSPACE_KEYWORD_PATTERN.test(args.prompt.replace(/\s+/g, " ").trim())) {
    return false;
  }
  return detectWorkspaceArtifactMutationIntent(args.prompt) !== null;
}

export function buildAutoArtifactRoutingHint(
  selectedWorkspaceDocuments: WorkspaceDocumentContextTarget[],
  intent: WorkspaceArtifactMutationIntent,
) {
  const lines = [
    "The user selected workspace document context and asked to mutate it (auto-routed to /artifact).",
    `Detected intent: ${intent}.`,
  ];

  if (selectedWorkspaceDocuments.length === 1) {
    const doc = selectedWorkspaceDocuments[0];
    lines.push(
      `Primary target: "${doc.title}"`,
      `artifactId: ${doc.artifactId}`,
      `workspaceId: ${doc.workspaceId}`,
    );
    if (intent === "update") {
      lines.push(
        "Call presentPlan with action=update and include the artifactId and workspaceId above unless the user clearly targets a different document.",
      );
    }
    if (intent === "delete") {
      lines.push(
        "Call confirmAction with action=delete and include the artifactId above unless the user clearly targets a different document.",
      );
    }
    return lines.join("\n");
  }

  lines.push("Multiple workspace documents are selected:");
  for (const [index, doc] of selectedWorkspaceDocuments.entries()) {
    lines.push(
      `${index + 1}. "${doc.title}" (artifactId: ${doc.artifactId}, workspaceId: ${doc.workspaceId})`,
    );
  }
  lines.push("Use askHuman if the target document is ambiguous.");
  return lines.join("\n");
}
