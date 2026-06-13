"use client";

import { useCallback } from "react";
import { api } from "@aqsha/convex/api";
import { useConvexMutationFn } from "@/lib/convex-query";

export type HitlAnswer = {
  prompt: string;
  selectedOptionIds?: string[];
  customAnswer?: string;
  skipped?: boolean;
};

export type HitlActions = {
  onAnswer: (toolCallId: string, answers: HitlAnswer[]) => Promise<void>;
  onApprove: (approvalId: string, workspaceId?: string) => Promise<void>;
  onDeny: (approvalId: string, reason?: string) => Promise<void>;
};

// Native in-thread HITL (plan §5.3): one unified respond mutation. The card
// callbacks carry the pendingInteractions row id as toolCallId/approvalId (see
// uiHitlMessageFromInteraction); the mutation records the response and forwards
// the resume to the agent service when the run is interrupted — no client-side
// resume step.
export function useHitlResume(): HitlActions {
  const respondV2 = useConvexMutationFn(api.agent.v2.interactions.respond);

  const onAnswer = useCallback(
    async (toolCallId: string, answers: HitlAnswer[]) => {
      await respondV2({
        interactionId: toolCallId as never,
        response: { kind: "answers", answers },
      });
    },
    [respondV2],
  );
  const onApprove = useCallback(
    async (approvalId: string, workspaceId?: string) => {
      await respondV2({
        interactionId: approvalId as never,
        response: {
          kind: "approval",
          approved: true,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });
    },
    [respondV2],
  );
  const onDeny = useCallback(
    async (approvalId: string, reason?: string) => {
      await respondV2({
        interactionId: approvalId as never,
        response: { kind: "approval", approved: false, ...(reason ? { note: reason } : {}) },
      });
    },
    [respondV2],
  );

  return { onAnswer, onApprove, onDeny };
}
