"use client";

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
  const respond = useConvexMutationFn(api.agent.interactions.respond);

  const onAnswer = async (toolCallId: string, answers: HitlAnswer[]) => {
    await respond({
      interactionId: toolCallId as never,
      response: { kind: "answers", answers },
    });
  };
  const onApprove = async (approvalId: string, workspaceId?: string) => {
    await respond({
      interactionId: approvalId as never,
      response: {
        kind: "approval",
        approved: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });
  };
  const onDeny = async (approvalId: string, reason?: string) => {
    await respond({
      interactionId: approvalId as never,
      response: { kind: "approval", approved: false, ...(reason ? { note: reason } : {}) },
    });
  };

  return { onAnswer, onApprove, onDeny };
}
