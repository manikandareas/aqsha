import { toast } from "sonner";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  type ArtifactId,
  toArtifactId,
  toWorkspaceId,
  type WorkspaceId,
} from "@/lib/convex-refs";

type CreateUrlMutation = (args: {
  workspaceId: WorkspaceId;
  url: string;
  title: string;
}) => Promise<unknown>;

type LinkArtifactMutation = (args: {
  artifactId: ArtifactId;
  workspaceId: WorkspaceId;
}) => Promise<unknown>;

/**
 * Shared Save-to-Workspace body: ingest a URL into a workspace via
 * `artifacts.createUrl`, with consistent success/error toasts. Re-throws on
 * failure so the caller's picker stays open. Used by both `SaveToWorkspaceButton`
 * (standalone readers) and the discovery feed's page-level save handler so the
 * copy + error handling can't drift between the two surfaces.
 */
export async function saveUrlToWorkspace(
  createUrl: CreateUrlMutation,
  args: { workspaceId: string; url: string; title: string },
): Promise<void> {
  try {
    await createUrl({
      workspaceId: toWorkspaceId(args.workspaceId),
      url: args.url,
      title: args.title,
    });
  } catch (error) {
    toast.error(readableConvexErrorMessage(error, "Gagal menyimpan ke workspace."));
    throw error;
  }
  toast.success("Disimpan ke workspace");
}

/**
 * Link an EXISTING headless artifact (e.g. an agent-generated document that was
 * born without a workspace) into a chosen workspace via
 * `artifacts.linkArtifactToWorkspace`. Mirrors `saveUrlToWorkspace`'s toast +
 * re-throw contract so the chat artifact card's picker stays open on failure.
 */
export async function linkArtifactToWorkspace(
  link: LinkArtifactMutation,
  args: { artifactId: string; workspaceId: string },
): Promise<void> {
  try {
    await link({
      artifactId: toArtifactId(args.artifactId),
      workspaceId: toWorkspaceId(args.workspaceId),
    });
  } catch (error) {
    toast.error(readableConvexErrorMessage(error, "Gagal menyimpan ke workspace."));
    throw error;
  }
  toast.success("Disimpan ke workspace");
}
