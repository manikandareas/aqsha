"use client";

import type { ActivityEvent } from "@aqsha/agent-contracts";
import { api } from "@aqsha/convex/api";
import {
  ArtifactTypeIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FolderIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import {
  artifactTypeLabel,
  provenanceLabel,
} from "@/components/artifact-presentation";
import { WorkspacePickerPopover } from "@/features/workspaces/components/workspace-picker-popover";
import { linkArtifactToWorkspace } from "@/features/workspaces/lib/save-to-workspace";
import { useConvexMutationState } from "@/lib/convex-query";
import { cn } from "@/lib/utils";
import { chatArtifactCardModel } from "../utils/turn-model";
import { formatDate } from "../utils/datetime";
import { useChatArtifactContext } from "./chat-artifact-context";
import { useThreadPanel } from "./thread-panel-context";

const emptyArtifacts = new Map();

// One `executeArtifact` tool call as a clickable artifact card (answer-stream
// redesign Fase 4 §7). While the write is in flight it shows a "Menulis/
// Memperbarui dokumen…" shimmer; once written it resolves the artifact row (icon,
// title, provenance, timestamp) and becomes clickable: on the full thread-detail
// surface it opens the artifact side panel (`useThreadPanel`), in a compact
// embedded panel it deep-links to the full artifact route (D2 — avoids
// panel-in-panel). No-leak: every value comes from `chatArtifactCardModel`
// (allow-listed scalars + the resolved row), never raw payload.
export function ChatArtifactCard({ node }: { node: ActivityEvent }) {
  const ctx = useChatArtifactContext();
  const panel = useThreadPanel();
  const artifactById = ctx?.artifactById ?? emptyArtifacts;
  const compact = ctx?.compact ?? false;
  const model = chatArtifactCardModel(node, artifactById);
  // Hook must run unconditionally (before the `model.live` early return below).
  const linkMutation = useConvexMutationState(api.artifacts.linkArtifactToWorkspace);

  if (model.live) {
    return <LiveArtifactCard action={model.action} title={model.title} />;
  }

  const typeLabel = artifactTypeLabel(model.artifactType);
  const provenance = provenanceLabel(model.source);
  const verb = model.action === "update" ? "Diperbarui" : "Dibuat";
  const timestamp = model.action === "update" ? model.updatedAt : model.createdAt;
  const metaParts = [
    `${verb}${timestamp ? ` · ${formatDate(timestamp)}` : ""}`,
    typeLabel,
    provenance,
  ].filter(Boolean) as string[];

  const body = (
    <>
      <ArtifactTypeIcon
        artifactType={model.artifactType}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words font-medium text-foreground">
          {model.title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {metaParts.join(" · ")}
        </span>
      </span>
    </>
  );

  // Full surface → open the side panel; compact panel → deep-link to the full
  // artifact route. Either needs the opaque id; the deep-link also needs the
  // artifact's own workspace (resolved from the row).
  const artifactId = model.artifactId;
  const canOpenPanel = !compact && panel != null && artifactId != null;
  const deepLinkHref =
    compact && artifactId && model.workspaceId
      ? `/app/workspaces/${model.workspaceId}/artifacts/${artifactId}`
      : undefined;
  const interactive = canOpenPanel || deepLinkHref != null;

  // Agent artifacts are born headless. Once the row resolves, offer to file it
  // into a workspace; after it's filed, swap the action for a "Tersimpan" badge.
  const canLink = model.found && artifactId != null && model.workspaceId == null;
  const isLinked = model.found && model.workspaceId != null;

  const handleLink = async (workspaceId: string) => {
    if (!artifactId) return;
    // Re-throws on failure (the helper toasts) so the picker stays open.
    await linkArtifactToWorkspace(linkMutation.mutateAsync, { artifactId, workspaceId });
  };

  let main: ReactNode;
  if (canOpenPanel) {
    main = (
      <button
        type="button"
        onClick={() => panel.openArtifactPanel(artifactId)}
        aria-label={`Buka dokumen ${model.title}`}
        className={mainInteractiveClass}
      >
        {body}
        <ChevronRightIcon className="size-4 shrink-0 self-center text-muted-foreground" />
      </button>
    );
  } else if (deepLinkHref) {
    main = (
      <Link
        href={deepLinkHref}
        aria-label={`Buka dokumen ${model.title}`}
        className={mainInteractiveClass}
      >
        {body}
        <ExternalLinkIcon className="size-4 shrink-0 self-center text-muted-foreground" />
      </Link>
    );
  } else {
    // No resolvable id/workspace yet — render without a click target rather than
    // a dead link.
    main = <div className={mainStaticClass}>{body}</div>;
  }

  return (
    <div className={cn(cardBaseClass, interactive && cardInteractiveClass)}>
      {main}
      {canLink ? (
        <WorkspacePickerPopover
          title="Simpan ke workspace"
          description="Pilih workspace tujuan untuk dokumen ini."
          align="end"
          onSelect={handleLink}
          trigger={
            <button
              type="button"
              aria-label="Simpan ke workspace"
              className={linkActionClass}
            >
              <FolderIcon className="size-4" />
            </button>
          }
        />
      ) : isLinked ? (
        <span className={linkedBadgeClass} aria-label="Tersimpan di workspace">
          <CheckIcon className="size-3.5" />
          Tersimpan
        </span>
      ) : null}
    </div>
  );
}

function LiveArtifactCard({
  action,
  title,
}: {
  action: "create" | "update";
  title: string;
}) {
  const label = action === "update" ? "Memperbarui dokumen…" : "Menulis dokumen…";
  return (
    <div className={staticCardClass}>
      <Spinner className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <Shimmer className="font-medium">{label}</Shimmer>
        {title && title !== "Dokumen" ? (
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {title}
          </span>
        ) : null}
      </span>
    </div>
  );
}

// The bordered container. It is NO LONGER the click target — the inner `main`
// element (button/Link) is — so the trailing Save action can sit beside it as a
// sibling without nesting a button inside a button.
const cardBaseClass =
  "flex w-full min-w-0 items-start gap-2 rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-left text-[13px] leading-5";
const cardInteractiveClass =
  "transition-colors hover:border-border hover:bg-card/70";
// `staticCardClass` is still used by the in-flight LiveArtifactCard (a plain,
// non-interactive row with the same chrome).
const staticCardClass = cardBaseClass;
// The clickable region inside the card (fills it, carries the focus ring).
const mainStaticClass = "flex min-w-0 flex-1 items-start gap-2.5";
const mainInteractiveClass = cn(
  mainStaticClass,
  "rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);
// Trailing Save-to-workspace trigger + the post-save "Tersimpan" badge.
const linkActionClass =
  "inline-flex size-7 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const linkedBadgeClass =
  "inline-flex shrink-0 items-center gap-1 self-center rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground";
