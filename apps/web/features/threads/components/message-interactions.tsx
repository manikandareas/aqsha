"use client";

import { createContext, use, type ReactNode } from "react";

/**
 * Openers for the thread detail side panels, exposed to in-message cards (source /
 * artifact / sub-question / plan) without prop-drilling. `MessageList` provides the
 * value from `useThreadPanel()`; this is the ONE place the shared message components
 * couple to the panel controller. Empty (all undefined) in compact chat panels, where
 * there is no detail slot — cards keep their default behaviour there.
 */
export type MessageInteractions = {
  openArtifact?: (artifactId: string) => void;
  /** All sources for one assistant message (the "Sumber" trigger). */
  openSources?: (messageId: string) => void;
  /** A `/deep` sub-question search step, scoped to its run (`turnId`). */
  openSearch?: (turnId: string, subQuestionIndex: number) => void;
  /** Any other expandable tool step by tool-call id (verify / counter-evidence / normal search). */
  openStep?: (toolCallId: string) => void;
  /** A run's research plan, scoped by `turnId` (or `LIVE_PLAN_KEY` for the live gate). */
  openPlan?: (turnId: string) => void;
};

const MessageInteractionsContext = createContext<MessageInteractions>({});

export function MessageInteractionsProvider({
  value,
  children,
}: {
  value: MessageInteractions;
  children: ReactNode;
}) {
  return (
    <MessageInteractionsContext.Provider value={value}>
      {children}
    </MessageInteractionsContext.Provider>
  );
}

export function useMessageInteractions(): MessageInteractions {
  return use(MessageInteractionsContext);
}
