"use client";

import { type ContextRef, contextRefsSignature } from "@aqsha/chat-core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DraftContextArtifact = { artifactId: string; title: string };

type ComposerMentionsContextValue = {
  contextArtifacts: DraftContextArtifact[];
  addContextArtifact: (artifact: DraftContextArtifact) => void;
  removeContextArtifact: (artifactId: string) => void;
};

const ComposerMentionsContext = createContext<ComposerMentionsContextValue | null>(null);

/** Token konteks ambient halaman (workspace/artifact/paper/berita) — disuntik composer otomatis.
 * Default `[]` → aman dibaca surface chat di halaman tanpa provider (mis. /app, /app/threads). */
const EMPTY_AMBIENT_REFS: ContextRef[] = [];

type AmbientContextRefsValue = {
  ambientContextRefs: ContextRef[];
  /** Override imperatif (mis. "Tanya Astra" di kartu feed → ganti token ke item itu). */
  setAmbientContextRefs: (refs: ContextRef[]) => void;
};
const AmbientContextRefsContext = createContext<AmbientContextRefsValue>({
  ambientContextRefs: EMPTY_AMBIENT_REFS,
  setAmbientContextRefs: () => {},
});

export function ComposerMentionsProvider({
  children,
  ambientContextRefs,
}: {
  children: ReactNode;
  threadId?: string;
  ambientWorkspaceId?: string | null;
  /** Token halaman aktif untuk auto-mention di composer (lihat MastraChatThreadSurface). */
  ambientContextRefs?: ContextRef[];
}) {
  const [contextArtifacts, setContextArtifacts] = useState<DraftContextArtifact[]>([]);
  const value = useMemo(
    () => ({
      contextArtifacts,
      addContextArtifact: (artifact: DraftContextArtifact) =>
        setContextArtifacts((current) =>
          current.some((item) => item.artifactId === artifact.artifactId)
            ? current
            : [...current, artifact],
        ),
      removeContextArtifact: (artifactId: string) =>
        setContextArtifacts((current) =>
          current.filter((item) => item.artifactId !== artifactId),
        ),
    }),
    [contextArtifacts],
  );

  // Token ambient = state internal supaya kartu "Tanya Astra" bisa override imperatif, TAPI
  // disinkron dari prop halaman (mis. data reader/artifact baru termuat). Pola "adjust state during
  // render" (guard signature) — bukan effect → tak memicu cascading render.
  const propRefs = ambientContextRefs ?? EMPTY_AMBIENT_REFS;
  const propSignature = contextRefsSignature(propRefs);
  const [ambientRefs, setAmbientRefs] = useState<ContextRef[]>(propRefs);
  const [seenPropSignature, setSeenPropSignature] = useState(propSignature);
  if (propSignature !== seenPropSignature) {
    setSeenPropSignature(propSignature);
    setAmbientRefs(propRefs);
  }
  const ambientValue = useMemo<AmbientContextRefsValue>(
    () => ({ ambientContextRefs: ambientRefs, setAmbientContextRefs: setAmbientRefs }),
    [ambientRefs],
  );

  return (
    <ComposerMentionsContext.Provider value={value}>
      <AmbientContextRefsContext.Provider value={ambientValue}>
        {children}
      </AmbientContextRefsContext.Provider>
    </ComposerMentionsContext.Provider>
  );
}

export function useComposerMentions() {
  const context = useContext(ComposerMentionsContext);
  if (!context) {
    throw new Error("useComposerMentions must be used within ComposerMentionsProvider");
  }
  return context;
}

/** Token konteks ambient halaman aktif. Aman di luar provider (kembalikan `[]`). */
export function useAmbientContextRefs(): ContextRef[] {
  return useContext(AmbientContextRefsContext).ambientContextRefs;
}

/** Setter token ambient — untuk "Tanya Astra" imperatif dari kartu feed/related. No-op tanpa provider. */
export function useSetAmbientContextRefs(): (refs: ContextRef[]) => void {
  return useContext(AmbientContextRefsContext).setAmbientContextRefs;
}

export function usePanelContextSelection(args: {
  workspaceId: string;
  workspaceName: string;
  titleById: Map<string, string>;
}) {
  const { contextArtifacts, addContextArtifact, removeContextArtifact } = useComposerMentions();
  const selectedIds = new Set(contextArtifacts.map((item) => item.artifactId));

  return {
    contextArtifacts,
    toggleArtifact: (artifact: DraftContextArtifact) => {
      const exists = contextArtifacts.some((item) => item.artifactId === artifact.artifactId);
      if (exists) removeContextArtifact(artifact.artifactId);
      else addContextArtifact(artifact);
    },
    removeContextArtifact,
    getArtifactSelected: (artifactId: string) => selectedIds.has(artifactId),
    onToggleArtifactContext: (artifactId: string) => {
      const existing = contextArtifacts.find((item) => item.artifactId === artifactId);
      if (existing) {
        removeContextArtifact(artifactId);
        return;
      }
      addContextArtifact({
        artifactId,
        title: args.titleById.get(artifactId) ?? "Paper",
      });
    },
    onSetArtifactContextSelection: (artifactIds: string[]) => {
      const keep = new Set(artifactIds);
      for (const item of contextArtifacts) {
        if (!keep.has(item.artifactId)) removeContextArtifact(item.artifactId);
      }
      for (const artifactId of artifactIds) {
        if (!selectedIds.has(artifactId)) {
          addContextArtifact({
            artifactId,
            title: args.titleById.get(artifactId) ?? "Paper",
          });
        }
      }
    },
  };
}
