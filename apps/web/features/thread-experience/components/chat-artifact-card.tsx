"use client";

import type { ActivityEvent } from "@aqsha/agent-contracts";
import {
  ArtifactTypeIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import {
  artifactTypeLabel,
  provenanceLabel,
} from "@/components/artifact-presentation";
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
    <CardShell>
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
    </CardShell>
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

  if (canOpenPanel) {
    return (
      <button
        type="button"
        onClick={() => panel.openArtifactPanel(artifactId)}
        aria-label={`Buka dokumen ${model.title}`}
        className={interactiveCardClass}
      >
        {body}
        <ChevronRightIcon className="size-4 shrink-0 self-center text-muted-foreground" />
      </button>
    );
  }

  if (deepLinkHref) {
    return (
      <Link
        href={deepLinkHref}
        aria-label={`Buka dokumen ${model.title}`}
        className={interactiveCardClass}
      >
        {body}
        <ExternalLinkIcon className="size-4 shrink-0 self-center text-muted-foreground" />
      </Link>
    );
  }

  // No resolvable id/workspace (e.g. a chat-only artifact, or the row hasn't
  // loaded yet) — render the card without a click target rather than a dead link.
  return <div className={staticCardClass}>{body}</div>;
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

const cardBaseClass =
  "flex w-full min-w-0 items-start gap-2.5 rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-left text-[13px] leading-5";
const interactiveCardClass = cn(
  cardBaseClass,
  "transition-colors hover:border-border hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);
const staticCardClass = cardBaseClass;

function CardShell({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 flex-1 items-start gap-2.5">{children}</span>;
}
