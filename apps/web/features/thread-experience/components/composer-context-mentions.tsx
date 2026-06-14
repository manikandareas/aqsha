"use client";

import {
  createContext,
  use,
  useState,
  type ReactNode,
} from "react";
import { api } from "@aqsha/convex/api";
import { toWorkspaceId } from "@/lib/convex-refs";
import {
  buildPaperMentionLabel,
  buildWorkspaceMentionLabel,
  contextRefKey,
  countContextRefs,
  MAX_CONTEXT_PAPERS,
  MAX_CONTEXT_WORKSPACES,
  type ContextRef,
} from "@/lib/context-refs";
import { useConvexQueryData } from "@/lib/convex-query";
import type {
  ContextItemOption,
  ContextWorkspaceOption,
} from "./composer-token-input";

type ComposerMentionsValue = {
  pinnedContextRefs: ContextRef[];
  setContextRefs: (refs: ContextRef[]) => void;
  appendContextRef: (ref: ContextRef) => void;
  contextWorkspaces: ContextWorkspaceOption[];
  ambientWorkspaceId: string | null;
  workspaceItems: ContextItemOption[] | undefined;
  workspaceItemsLoading: boolean;
  requestWorkspaceItems: (workspaceId: string | null) => void;
};

const ComposerMentionsContext = createContext<ComposerMentionsValue | null>(null);

export function useComposerMentions() {
  return use(ComposerMentionsContext);
}

function truncate(value: string, max: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

export function ComposerMentionsProvider({
  threadId,
  ambientWorkspaceId = null,
  children,
}: {
  threadId?: string;
  ambientWorkspaceId?: string | null;
  children: ReactNode;
}) {
  // Remount per thread so local edits reset cleanly when switching threads,
  // without a reset effect or ref-in-render (both barred by the lint config).
  return (
    <ComposerMentionsProviderInner
      key={threadId ?? "__draft__"}
      ambientWorkspaceId={ambientWorkspaceId}
    >
      {children}
    </ComposerMentionsProviderInner>
  );
}

function ComposerMentionsProviderInner({
  ambientWorkspaceId,
  children,
}: {
  ambientWorkspaceId: string | null;
  children: ReactNode;
}) {
  const workspacesPage = useConvexQueryData(api.workspaces.list, {
    paginationOpts: { numItems: 50, cursor: null },
  });
  const contextWorkspaces: ContextWorkspaceOption[] = (workspacesPage?.page ?? []).map((workspace) => ({
    workspaceId: String(workspace._id),
    name: workspace.name,
    emoji: workspace.emoji,
  }));

  // The composer draft: the pills the user is adding for the CURRENT compose.
  // Starts empty and is cleared after each send — the composer never re-seeds
  // previously-pinned context, so navigating into a thread leaves it empty.
  // Pinned context lives server-side (threadContextWorkspaces / *Artifacts) and
  // the agent reads it regardless of what the composer shows.
  const [contextRefs, setContextRefs] = useState<ContextRef[]>([]);

  const appendContextRef = (ref: ContextRef) => {
    setContextRefs((current) => {
      const key = contextRefKey(ref);
      if (current.some((existing) => contextRefKey(existing) === key)) {
        return current;
      }
      const counts = countContextRefs(current);
      if (ref.kind === "workspace" && counts.workspaces >= MAX_CONTEXT_WORKSPACES) {
        return current;
      }
      if (ref.kind === "paper" && counts.papers >= MAX_CONTEXT_PAPERS) {
        return current;
      }
      return [...current, ref];
    });
  };

  const [pickerWorkspaceId, setPickerWorkspaceId] = useState<string | null>(null);
  const pickerItems = useConvexQueryData(
    api.artifacts.listForContextPicker,
    pickerWorkspaceId ? { workspaceId: toWorkspaceId(pickerWorkspaceId) } : "skip",
  );
  const workspaceItems: ContextItemOption[] | undefined = (() => {
    if (!pickerWorkspaceId || pickerItems === undefined) {
      return undefined;
    }
    return pickerItems.map((item) => ({
      workspaceId: String(item.workspaceId ?? pickerWorkspaceId),
      artifactId: String(item._id),
      title: item.title,
    }));
  })();

  const requestWorkspaceItems = (workspaceId: string | null) => {
    setPickerWorkspaceId(workspaceId);
  };

  const value: ComposerMentionsValue = {
    pinnedContextRefs: contextRefs,
    setContextRefs,
    appendContextRef,
    contextWorkspaces,
    ambientWorkspaceId,
    workspaceItems,
    workspaceItemsLoading: pickerWorkspaceId !== null && pickerItems === undefined,
    requestWorkspaceItems,
  };

  return (
    <ComposerMentionsContext.Provider value={value}>
      {children}
    </ComposerMentionsContext.Provider>
  );
}

/** Build a paper context ref (used by side panels inserting the same token). */
function buildPaperContextRef(args: {
  workspaceId: string;
  workspaceName: string;
  artifactId: string;
  title: string;
}): ContextRef {
  return {
    kind: "paper",
    workspaceId: args.workspaceId,
    artifactId: args.artifactId,
    label: buildPaperMentionLabel(
      truncate(args.workspaceName, 16),
      truncate(args.title, 20),
    ),
  };
}

/** Build a workspace context ref (used by side panels). */
function buildWorkspaceContextRef(args: {
  workspaceId: string;
  workspaceName: string;
}): ContextRef {
  return {
    kind: "workspace",
    workspaceId: args.workspaceId,
    label: buildWorkspaceMentionLabel(args.workspaceName),
  };
}

/**
 * Adapter so a workspace library grid can drive the inline context pills:
 * clicking a paper inserts the same `@workspace:paper` token the composer
 * produces. Returns null-safe handlers when no mention provider is mounted.
 */
export function usePanelContextSelection(args: {
  workspaceId: string;
  workspaceName: string;
  titleById: Map<string, string>;
}) {
  const mentions = useComposerMentions();
  const refs = mentions?.pinnedContextRefs ?? [];
  const selectedArtifactIds = new Set(
    refs.flatMap((ref) => (ref.kind === "paper" ? [ref.artifactId] : [])),
  );

  const getArtifactSelected = (artifactId: string) =>
    selectedArtifactIds.has(artifactId);

  const onToggleArtifactContext = (artifactId: string) => {
    if (!mentions) {
      return;
    }
    if (selectedArtifactIds.has(artifactId)) {
      mentions.setContextRefs(
        refs.filter(
          (ref) => !(ref.kind === "paper" && ref.artifactId === artifactId),
        ),
      );
      return;
    }
    mentions.appendContextRef(
      buildPaperContextRef({
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
        artifactId,
        title: args.titleById.get(artifactId) ?? "Paper",
      }),
    );
  };

  const onSetArtifactContextSelection = (artifactIds: string[]) => {
    if (!mentions) {
      return;
    }
    const otherRefs = refs.filter(
      (ref) => !(ref.kind === "paper" && ref.workspaceId === args.workspaceId),
    );
    const nextPaperRefs = artifactIds
      .slice(0, MAX_CONTEXT_PAPERS)
      .map((artifactId) =>
        buildPaperContextRef({
          workspaceId: args.workspaceId,
          workspaceName: args.workspaceName,
          artifactId,
          title: args.titleById.get(artifactId) ?? "Paper",
        }),
      );
    mentions.setContextRefs([...otherRefs, ...nextPaperRefs]);
  };

  return {
    getArtifactSelected,
    onToggleArtifactContext,
    onSetArtifactContextSelection,
  };
}
