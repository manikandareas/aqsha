"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import type { ResearchArtifact } from "../types";

// Per-transcript artifact resolution (answer-stream redesign Fase 4). The chat
// artifact card can sit several levels deep (assistant turn → deep-phase
// accordion → activity row), so the per-thread artifact list + the `compact`
// flag are shared via context instead of prop-drilling. Mounted by
// `ThreadChatSurface` on every chat surface (thread-detail main + the two compact
// panels), so the card always resolves its row and knows whether to open the side
// panel (full surface) or deep-link (compact panel, D2).

type ChatArtifactContextValue = {
  artifactById: Map<string, ResearchArtifact>;
  compact: boolean;
};

const ChatArtifactContext = createContext<ChatArtifactContextValue | null>(null);

export function useChatArtifactContext(): ChatArtifactContextValue | null {
  return use(ChatArtifactContext);
}

export function ChatArtifactProvider({
  artifacts,
  compact,
  children,
}: {
  artifacts: ResearchArtifact[];
  compact: boolean;
  children: ReactNode;
}) {
  const value = useMemo<ChatArtifactContextValue>(
    () => ({
      artifactById: new Map(artifacts.map((artifact) => [artifact._id, artifact])),
      compact,
    }),
    [artifacts, compact],
  );

  return (
    <ChatArtifactContext.Provider value={value}>
      {children}
    </ChatArtifactContext.Provider>
  );
}
